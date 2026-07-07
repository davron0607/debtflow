// DebtFlow API — серверные функции. Вся безопасность здесь:
// RBAC по матрице возможностей, скоупинг по организации, zod-валидация входа,
// append-only аудит. Клиент никогда не является границей безопасности.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "./backend/db";
import {
  assertSameOrigin,
  checkLoginRateLimit,
  checkRateLimit,
  consumeResetToken,
  consumeVerificationToken,
  createResetToken,
  createSession,
  INVITE_TTL_MS,
  createVerificationToken,
  currentUser,
  destroySession,
  hashPassword,
  isDemoMode,
  requireUser,
  requireUserMutation,
  verifyPassword,
} from "./backend/auth";
import { logEvent } from "./backend/log";
import { sendMail } from "./mail/resend";
import { getRequestHost, getRequestProtocol, getRequestIP } from "@tanstack/react-start/server";
import { canTransition } from "./state-machine";
import type { DB as SnapshotDB, UserRole, CaseStatus } from "./store/types";

// ——— RBAC-хелперы ———
const BANK_ROLES: UserRole[] = ["BANK_ADMIN", "BANK_LEGAL"];
const isBank = (u: User) => BANK_ROLES.includes(u.role as UserRole);
const COLLECTOR_ROLES: UserRole[] = ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"];
const isCollector = (u: User) => COLLECTOR_ROLES.includes(u.role as UserRole);

function forbid(msg = "FORBIDDEN"): never {
  throw new Error(msg);
}

// Скоуп дел (мультитенантность): админ/юрист банка — портфель своего банка;
// все исполнители (агентства, юрфирмы, внутрибанковские коллекторы) —
// только дела, назначенные их организации.
function caseScope(u: User): Prisma.CaseWhereInput {
  if (u.role === "PLATFORM_ADMIN") return { id: "__none__" }; // оператор не видит дела
  return isBank(u) ? { tenantBankId: u.orgId } : { assignedOrgId: u.orgId };
}

// Организация должна быть одобрена оператором платформы (банки/МФО)
async function requireActiveOrg(u: User) {
  const org = await prisma.organization.findUnique({ where: { id: u.orgId } });
  if (!org || org.status === "PENDING")
    forbid("Организация на проверке оператором платформы — действие пока недоступно");
  if (org.status === "REJECTED") forbid("Заявка организации отклонена");
  return org;
}

async function requireCaseInScope(u: User, caseId: string) {
  const c = await prisma.case.findFirst({ where: { id: caseId, ...caseScope(u) } });
  if (!c) forbid("Дело не найдено или недоступно");
  return c;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

// ——— Аудит: единственный путь записи событий (append-only) ———
async function audit(
  actorUserId: string,
  caseId: string,
  type: string,
  payload: Record<string, unknown> = {},
  reason?: string,
) {
  await prisma.caseEvent.create({
    data: { caseId, actorUserId, type, payload: payload as Prisma.InputJsonObject, reason },
  });
  // Структурированный лог каждой мутации (все они проходят через audit)
  logEvent("info", "case_mutation", { type, caseId, actorUserId, reason });
}

// ——— Auth ———
export const apiLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email(), password: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const email = data.email.toLowerCase().trim();
    if (!(await checkLoginRateLimit(email)).ok)
      return { ok: false as const, error: "Слишком много попыток. Подождите 15 минут." };
    const user = await prisma.user.findUnique({ where: { email } });
    // Единое сообщение — не раскрываем, существует ли e-mail
    const fail = { ok: false as const, error: "Неверный e-mail или пароль" };
    if (!user) {
      logEvent("warn", "login_failed", { reason: "unknown_email" });
      return fail;
    }
    if (!user.active) {
      logEvent("warn", "login_failed", { userId: user.id, reason: "inactive" });
      return { ok: false as const, error: "Доступ отключён администратором" };
    }
    if (!(await verifyPassword(data.password, user.passwordHash))) {
      logEvent("warn", "login_failed", { userId: user.id, reason: "bad_password" });
      return fail;
    }
    if (!user.emailVerifiedAt) {
      logEvent("warn", "login_failed", { userId: user.id, reason: "email_not_verified" });
      return {
        ok: false as const,
        error: "E-mail не подтверждён. Проверьте почту или запросите письмо повторно.",
        needsVerification: true,
      };
    }
    await createSession(user.id);
    logEvent("info", "login_ok", { userId: user.id });
    return { ok: true as const };
  });

// ——— Регистрация организации-партнёра (с подтверждением e-mail) ———
async function sendVerificationEmail(userId: string, email: string, name: string) {
  const token = await createVerificationToken(userId);
  const appUrl = `${getRequestProtocol()}://${getRequestHost({ xForwardedHost: true })}`;
  const res = await sendMail({
    to: email,
    subject: "DebtFlow: подтвердите e-mail",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px">
        <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
        <p>Здравствуйте, ${name}!</p>
        <p>Подтвердите e-mail, чтобы активировать доступ вашей организации к DebtFlow.
           Ссылка действует 24 часа.</p>
        <p><a href="${appUrl}/verify-email?token=${token}"
              style="background:#1B3A5C;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">
          Подтвердить e-mail</a></p>
        <p style="color:#888;font-size:12px">Если вы не регистрировались в DebtFlow — игнорируйте письмо.</p>
      </div>`,
  });
  logEvent("info", "verification_email", { userId, mailSent: res.ok, mailError: res.error });
  return res;
}

// Антифрод для банков/МФО: бесплатные почтовые провайдеры запрещены,
// e-mail обязан быть на заявленном официальном домене, у домена должны
// существовать MX-записи (реальная почтовая инфраструктура).
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "mail.ru", "bk.ru", "inbox.ru", "list.ru", "yandex.ru", "yandex.com",
  "ya.ru", "rambler.ru", "proton.me", "protonmail.com", "gmx.com", "aol.com", "mail.com",
]);

const normalizeDomain = (d: string) =>
  d.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

async function domainHasMx(domain: string): Promise<boolean> {
  try {
    const { resolveMx } = await import("node:dns/promises");
    const mx = await resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}

export const apiRegister = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orgName: z.string().min(2).max(200),
      orgType: z.enum(["COLLECTOR", "LEGAL_FIRM", "BANK", "MFO"]),
      orgDomain: z.string().max(200).optional(), // обязателен для BANK/MFO
      name: z.string().min(2).max(200),
      email: z.string().email(),
      password: z.string().min(8).max(200),
    }),
  )
  .handler(async ({ data }) => {
    assertSameOrigin();
    const email = data.email.toLowerCase().trim();
    const emailDomain = email.split("@")[1] ?? "";
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (!(await checkRateLimit("register-ip", ip)).ok)
      return { ok: false as const, error: "Слишком много регистраций. Попробуйте позже." };
    if (await prisma.user.findUnique({ where: { email } }))
      return { ok: false as const, error: "Этот e-mail уже зарегистрирован" };

    const isFinancial = data.orgType === "BANK" || data.orgType === "MFO";
    let orgDomain: string | null = null;

    if (isFinancial) {
      if (!data.orgDomain?.trim())
        return { ok: false as const, error: "Для банка/МФО укажите официальный домен организации" };
      orgDomain = normalizeDomain(data.orgDomain);
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(orgDomain))
        return { ok: false as const, error: "Укажите корректный домен, например tengebank.uz" };
      if (FREE_MAIL.has(emailDomain))
        return { ok: false as const, error: "Для банка/МФО нужен корпоративный e-mail, а не публичный почтовый сервис" };
      if (emailDomain !== orgDomain && !emailDomain.endsWith("." + orgDomain))
        return {
          ok: false as const,
          error: `E-mail должен быть на домене организации (@${orgDomain}) — это подтверждает, что вы действуете от её имени`,
        };
      if (await prisma.organization.findFirst({ where: { domain: orgDomain } }))
        return { ok: false as const, error: "Организация с этим доменом уже зарегистрирована" };
      if (!(await domainHasMx(emailDomain))) {
        logEvent("warn", "register_mx_failed", { domain: emailDomain });
        return { ok: false as const, error: "Домен не принимает почту (нет MX-записей) — проверьте адрес" };
      }
    }

    // Новая организация + её первый пользователь (не подтверждён до клика в письме)
    const org = await prisma.organization.create({
      // Банки/МФО после подтверждения e-mail проходят модерацию оператором платформы
      data: { name: data.orgName.trim(), type: data.orgType, domain: orgDomain, status: isFinancial ? "PENDING" : "ACTIVE" },
    });
    const user = await prisma.user.create({
      data: {
        orgId: org.id,
        name: data.name.trim(),
        email,
        role: isFinancial ? "BANK_ADMIN" : "MANAGER",
        passwordHash: await hashPassword(data.password),
        emailVerifiedAt: null,
      },
    });
    logEvent("info", "org_registered", { orgId: org.id, userId: user.id, orgType: data.orgType, domain: orgDomain });
    await sendVerificationEmail(user.id, email, user.name);
    return { ok: true as const };
  });

export const apiResendVerification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const email = data.email.toLowerCase().trim();
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (!(await checkRateLimit("verify-ip", ip)).ok || !(await checkRateLimit("verify-email", email)).ok)
      return { ok: true as const };
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt) await sendVerificationEmail(user.id, email, user.name);
    return { ok: true as const }; // не раскрываем существование адреса
  });

export const apiVerifyEmail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(32).max(128) }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const userId = await consumeVerificationToken(data.token);
    if (!userId)
      return { ok: false as const, error: "Ссылка недействительна или устарела. Запросите письмо повторно." };
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await createSession(userId); // сразу входим после подтверждения
    logEvent("info", "email_verified", { userId });
    return { ok: true as const };
  });

// ——— Модерация организаций (оператор платформы) ———
export const apiModerationList = createServerFn({ method: "GET" }).handler(async () => {
  const u = await requireUser();
  if (u.role !== "PLATFORM_ADMIN") forbid("Только оператор платформы");
  const orgs = await prisma.organization.findMany({
    where: { status: { in: ["PENDING", "REJECTED"] } },
    include: {
      users: {
        select: { name: true, email: true, role: true, emailVerifiedAt: true, createdAt: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    status: o.status,
    domain: o.domain,
    createdAt: o.createdAt.toISOString(),
    admin: o.users[0]
      ? {
          name: o.users[0].name,
          email: o.users[0].email,
          emailVerified: !!o.users[0].emailVerifiedAt,
        }
      : null,
  }));
});

export const apiModerateOrg = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orgId: z.string(),
      decision: z.enum(["APPROVE", "REJECT"]),
      reason: z.string().max(1000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (u.role !== "PLATFORM_ADMIN") forbid("Только оператор платформы");
    const org = await prisma.organization.findUnique({
      where: { id: data.orgId },
      include: { users: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!org) return { ok: false as const, error: "Организация не найдена" };
    if (data.decision === "REJECT" && !data.reason?.trim())
      return { ok: false as const, error: "Для отклонения обязательна причина" };
    const status = data.decision === "APPROVE" ? "ACTIVE" : "REJECTED";
    await prisma.organization.update({ where: { id: org.id }, data: { status } });
    logEvent("info", "org_moderated", {
      orgId: org.id,
      decision: data.decision,
      byUserId: u.id,
      reason: data.reason,
    });
    const admin = org.users[0];
    if (admin) {
      await sendMail({
        to: admin.email,
        subject:
          data.decision === "APPROVE"
            ? "DebtFlow: организация одобрена"
            : "DebtFlow: заявка отклонена",
        html:
          data.decision === "APPROVE"
            ? `<div style="font-family:Arial,sans-serif;max-width:520px">
                 <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
                 <p>Здравствуйте, ${admin.name}!</p>
                 <p>Организация <b>${org.name}</b> прошла проверку. Полный доступ открыт:
                    загрузка портфеля, назначения, работа с делами.</p>
               </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:520px">
                 <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
                 <p>Здравствуйте, ${admin.name}!</p>
                 <p>К сожалению, заявка организации <b>${org.name}</b> отклонена.</p>
                 <p>Причина: ${data.reason}</p>
               </div>`,
      });
    }
    return { ok: true as const };
  });

// ——— Сброс пароля (Resend) ———
export const apiRequestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const email = data.email.toLowerCase().trim();
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (!(await checkRateLimit("pwreset-ip", ip)).ok || !(await checkRateLimit("pwreset-email", email)).ok)
      return { ok: true as const }; // тот же ответ — без раскрытия
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.active) {
      const token = await createResetToken(user.id);
      const appUrl = `${getRequestProtocol()}://${getRequestHost({ xForwardedHost: true })}`;
      const res = await sendMail({
        to: user.email,
        subject: "DebtFlow: сброс пароля",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px">
            <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
            <p>Здравствуйте, ${user.name}!</p>
            <p>Вы (или кто-то от вашего имени) запросили сброс пароля. Ссылка действует 1 час.</p>
            <p><a href="${appUrl}/reset-password?token=${token}"
                  style="background:#1B3A5C;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">
              Задать новый пароль</a></p>
            <p style="color:#888;font-size:12px">Если это были не вы — просто игнорируйте письмо.</p>
          </div>`,
      });
      logEvent("info", "password_reset_requested", { userId: user.id, mailSent: res.ok, mailError: res.error });
    } else {
      logEvent("warn", "password_reset_unknown_email", {});
    }
    // Всегда ok — не раскрываем существование адреса
    return { ok: true as const };
  });

export const apiResetPassword = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(32).max(128), password: z.string().min(8).max(200) }))
  .handler(async ({ data }) => {
    assertSameOrigin();
    const userId = await consumeResetToken(data.token);
    if (!userId) return { ok: false as const, error: "Ссылка недействительна или устарела. Запросите новую." };
    await prisma.user.update({
      where: { id: userId },
      // Ссылка пришла на почту — владение ящиком подтверждено (важно для приглашений)
      data: { passwordHash: await hashPassword(data.password), emailVerifiedAt: new Date() },
    });
    // Инвалидация всех прежних сессий + автологин с новым паролем
    await prisma.session.deleteMany({ where: { userId } });
    await createSession(userId);
    logEvent("info", "password_reset_done", { userId });
    return { ok: true as const };
  });

export const apiLogout = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true };
});

// Демо-переключатель ролей (только DEMO_MODE)
export const apiSwitchUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    if (!isDemoMode()) forbid("Переключение ролей отключено в production");
    await requireUserMutation();
    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target || !target.active) forbid();
    await destroySession();
    await createSession(target.id);
    return { ok: true };
  });

// ——— Snapshot: все данные, доступные текущей роли ———
export const apiSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const u = await currentUser();
  if (!u) return { authenticated: false as const };

  const scope = caseScope(u);
  const cases = await prisma.case.findMany({ where: scope, orderBy: { code: "asc" } });
  const caseIds = cases.map((c) => c.id);
  const inCase = { caseId: { in: caseIds } };

  const [orgs, users, debtors, events, documents, payments, costs, slas, assignments, transfers, visits] =
    await Promise.all([
      prisma.organization.findMany(),
      // Пользователи (мультитенантность): банк видит свою орг + партнёров
      // (для назначений и имён в аудите), но НЕ других банков; партнёры — свою орг
      // + банки (имена акторов в таймлайне). Пароль-хэши не покидают сервер никогда.
      prisma.user.findMany({
        where: isDemoMode()
          ? {}
          : isBank(u)
          ? { OR: [{ orgId: u.orgId }, { org: { type: { in: ["COLLECTOR", "LEGAL_FIRM"] } } }] }
          : { OR: [{ orgId: u.orgId }, { org: { type: { in: ["BANK", "MFO"] } } }] },
        select: { id: true, orgId: true, name: true, email: true, role: true, edsOperational: true, active: true, emailVerifiedAt: true },
      }),
      prisma.debtor.findMany({ where: { cases: { some: scope } } }),
      prisma.caseEvent.findMany({ where: inCase, orderBy: { createdAt: "desc" }, take: 2000 }),
      prisma.caseDocument.findMany({ where: inCase }),
      prisma.payment.findMany({ where: inCase }),
      prisma.costEntry.findMany({ where: inCase }),
      prisma.slaTimer.findMany({ where: inCase }),
      prisma.assignment.findMany({ where: inCase }),
      prisma.transfer.findMany({ where: inCase }),
      prisma.fieldVisit.findMany({ where: inCase }),
    ]);

  const db: SnapshotDB = {
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, type: o.type, status: o.status, domain: o.domain ?? undefined })),
    users: users.map((x) => ({ ...x, edsOperational: x.edsOperational ?? undefined, role: x.role as UserRole, emailVerifiedAt: x.emailVerifiedAt?.toISOString() })),
    debtors: debtors.map((d) => ({
      ...d,
      assetProfile: d.assetProfile ?? undefined,
      accountBalancesUSD: d.accountBalancesUSD ?? undefined,
    })),
    cases: cases.map((c) => ({
      id: c.id,
      code: c.code,
      tenantBankId: c.tenantBankId,
      debtorId: c.debtorId,
      amountUSD: c.amountUSD,
      amountUZS: Number(c.amountUZS),
      collateral: c.collateral,
      type: c.type,
      status: c.status as CaseStatus,
      dpd: c.dpd,
      assignedOrgId: c.assignedOrgId ?? undefined,
      assignedUserId: c.assignedUserId ?? undefined,
      voluntaryPeriodDays: c.voluntaryPeriodDays ?? undefined,
      enforcementRoute: c.enforcementRoute,
      createdAt: c.createdAt.toISOString(),
      originatedAt: c.originatedAt.toISOString(),
    })),
    events: events.map((e) => ({
      id: e.id,
      caseId: e.caseId,
      actorUserId: e.actorUserId,
      type: e.type as SnapshotDB["events"][number]["type"],
      payload: (e.payload ?? {}) as SnapshotDB["events"][number]["payload"],
      result: e.result ?? undefined,
      reason: e.reason ?? undefined,
      createdAt: e.createdAt.toISOString(),
    })),
    documents: documents.map((d) => ({
      ...d,
      status: d.status as "DRAFT" | "READY" | "SENT",
      signedByEds: d.signedByEds ?? undefined,
      generatedAt: d.generatedAt.toISOString(),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      caseId: p.caseId,
      amountUSD: p.amountUSD,
      kind: p.kind,
      promisedDate: iso(p.promisedDate),
      paidAt: iso(p.paidAt),
    })),
    costs: costs.map((k) => ({
      id: k.id,
      caseId: k.caseId,
      kind: k.kind,
      amountUSD: k.amountUSD,
      note: k.note ?? undefined,
      createdAt: k.createdAt.toISOString(),
    })),
    slas: slas.map((s) => ({ ...s, dueAt: s.dueAt.toISOString() })),
    assignments: assignments.map((a) => ({
      id: a.id,
      caseId: a.caseId,
      fromOrgId: a.fromOrgId ?? undefined,
      toOrgId: a.toOrgId,
      byUserId: a.byUserId,
      reason: a.reason ?? undefined,
      at: a.at.toISOString(),
    })),
    transfers: transfers.map((t) => ({
      id: t.id,
      caseId: t.caseId,
      amountUSD: t.amountUSD,
      initiatedByUserId: t.initiatedByUserId,
      initiatedAt: t.initiatedAt.toISOString(),
      managerApprovedByUserId: t.managerApprovedByUserId ?? undefined,
      managerApprovedAt: iso(t.managerApprovedAt),
      accountantApprovedByUserId: t.accountantApprovedByUserId ?? undefined,
      accountantApprovedAt: iso(t.accountantApprovedAt),
      status: t.status,
    })),
    visits: visits.map((v) => ({
      id: v.id,
      caseId: v.caseId,
      collectorUserId: v.collectorUserId,
      lat: v.lat,
      lng: v.lng,
      startedAt: v.startedAt.toISOString(),
      endedAt: iso(v.endedAt),
      result: v.result ?? undefined,
      note: v.note ?? undefined,
    })),
  };

  return {
    authenticated: true as const,
    demoMode: isDemoMode(),
    currentUser: {
      id: u.id,
      orgId: u.orgId,
      name: u.name,
      email: u.email,
      role: u.role as UserRole,
      edsOperational: u.edsOperational ?? undefined,
      active: u.active,
    },
    db,
  };
});

// ——— Переходы статусов (state machine — на сервере) ———
export const apiTransition = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ caseId: z.string(), to: z.string(), reason: z.string().max(1000).optional() }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const c = await requireCaseInScope(u, data.caseId);
    const to = data.to as CaseStatus;
    if (!canTransition(c.status as CaseStatus, to, u.role as UserRole))
      return { ok: false, error: "Переход не разрешён для этой роли/статуса" };
    const destructive = to === "WRITTEN_OFF" || to === "CLOSED";
    if (destructive && !data.reason?.trim())
      return { ok: false, error: "Для этого действия обязательна причина (аудит)" };
    await prisma.case.update({ where: { id: c.id }, data: { status: to } });
    await audit(u.id, c.id, "STATUS_CHANGED", { from: c.status, to }, data.reason);
    return { ok: true };
  });

// ——— Назначения (только банк-админ) ———
export const apiAssign = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ caseId: z.string(), toOrgId: z.string(), reason: z.string().max(1000).optional() }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (u.role !== "BANK_ADMIN") forbid("Назначает только администратор банка");
    await requireActiveOrg(u);
    // Тенант-скоуп: банк распоряжается только собственным портфелем
    const c = await prisma.case.findFirst({ where: { id: data.caseId, tenantBankId: u.orgId } });
    if (!c) forbid("Дело не найдено или недоступно");
    const target = await prisma.organization.findUnique({ where: { id: data.toOrgId } });
    const inHouse = target?.id === u.orgId; // собственная служба взыскания банка
    if (!target || (!inHouse && target.type !== "COLLECTOR" && target.type !== "LEGAL_FIRM"))
      forbid("Назначать можно коллекторам, юр. фирмам или собственной службе");
    if (c.assignedOrgId && !data.reason?.trim())
      return { ok: false, error: "Переназначение требует обоснования (аудит)" };
    await prisma.$transaction([
      prisma.case.update({
        where: { id: c.id },
        data: { assignedOrgId: data.toOrgId, status: c.status === "NEW" ? "ASSIGNED" : c.status },
      }),
      prisma.assignment.create({
        data: {
          caseId: c.id,
          fromOrgId: c.assignedOrgId,
          toOrgId: data.toOrgId,
          byUserId: u.id,
          reason: data.reason,
        },
      }),
    ]);
    await audit(u.id, c.id, c.assignedOrgId ? "REASSIGNED" : "ASSIGNED", {
      toOrgId: data.toOrgId,
      fromOrgId: c.assignedOrgId,
    }, data.reason);
    return { ok: true };
  });

// ——— Распределение по сотрудникам внутри организации-исполнителя ———
export const apiAssignUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ caseId: z.string(), userId: z.string().nullable() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!["MANAGER", "BANK_ADMIN"].includes(u.role))
      forbid("Исполнителя назначает менеджер организации (или админ банка для in-house)");
    // Дело должно быть назначено организации текущего пользователя
    const c = await prisma.case.findFirst({ where: { id: data.caseId, assignedOrgId: u.orgId } });
    if (!c) forbid("Дело не назначено вашей организации");
    let target: User | null = null;
    if (data.userId) {
      target = await prisma.user.findUnique({ where: { id: data.userId } });
      if (!target || target.orgId !== u.orgId || !target.active)
        forbid("Сотрудник не найден в вашей организации");
      const workRoles = ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "LEGAL_FIRM"];
      if (!workRoles.includes(target.role)) forbid("Исполнителем может быть коллектор или юрист");
    }
    await prisma.case.update({ where: { id: c.id }, data: { assignedUserId: data.userId } });
    await audit(u.id, c.id, "ASSIGNED_USER", {
      toUserId: data.userId,
      toUserName: target?.name ?? null,
      fromUserId: c.assignedUserId ?? null,
    });
    return { ok: true as const };
  });

// ——— Работа коллектора ———
export const apiLogContact = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      caseId: z.string(),
      note: z.string().max(2000),
      result: z.enum(["CONTACTED", "NO_CONTACT"]),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!isCollector(u) && u.role !== "BANK_ADMIN") forbid();
    const c = await requireCaseInScope(u, data.caseId);
    await audit(u.id, c.id, "CONTACT_LOGGED", { note: data.note, result: data.result });
    if (
      (c.status === "ASSIGNED" || c.status === "SOFT_COLLECTION") &&
      canTransition(c.status as CaseStatus, data.result, u.role as UserRole)
    ) {
      await prisma.case.update({ where: { id: c.id }, data: { status: data.result } });
      await audit(u.id, c.id, "STATUS_CHANGED", { from: c.status, to: data.result });
    }
    return { ok: true };
  });

export const apiLogPromise = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      caseId: z.string(),
      promisedDate: z.string(),
      amountUSD: z.number().int().positive().max(100_000_000),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!isCollector(u) && u.role !== "BANK_ADMIN") forbid();
    const c = await requireCaseInScope(u, data.caseId);
    await prisma.$transaction([
      prisma.payment.create({
        data: { caseId: c.id, amountUSD: data.amountUSD, kind: "PROMISE", promisedDate: new Date(data.promisedDate) },
      }),
      prisma.slaTimer.create({
        data: { caseId: c.id, type: "PROMISE_DUE", dueAt: new Date(data.promisedDate) },
      }),
    ]);
    await audit(u.id, c.id, "PROMISE_LOGGED", { promisedDate: data.promisedDate, amountUSD: data.amountUSD });
    if (canTransition(c.status as CaseStatus, "PROMISE_TO_PAY", u.role as UserRole)) {
      await prisma.case.update({ where: { id: c.id }, data: { status: "PROMISE_TO_PAY" } });
      await audit(u.id, c.id, "STATUS_CHANGED", { from: c.status, to: "PROMISE_TO_PAY" });
    }
    return { ok: true };
  });

export const apiRecordPayment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      caseId: z.string(),
      amountUSD: z.number().int().positive().max(100_000_000),
      kind: z.enum(["FULL", "PARTIAL"]),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!isCollector(u) && u.role !== "BANK_ADMIN" && u.role !== "ACCOUNTANT") forbid();
    const c = await requireCaseInScope(u, data.caseId);
    await prisma.payment.create({
      data: { caseId: c.id, amountUSD: data.amountUSD, kind: data.kind, paidAt: new Date() },
    });
    await audit(u.id, c.id, "PAYMENT_RECORDED", { amountUSD: data.amountUSD, kind: data.kind });
    const to = data.kind === "FULL" ? "PAID" : "PARTIALLY_PAID";
    if (canTransition(c.status as CaseStatus, to, u.role as UserRole)) {
      await prisma.case.update({ where: { id: c.id }, data: { status: to } });
      await audit(u.id, c.id, "STATUS_CHANGED", { from: c.status, to });
    }
    return { ok: true };
  });

// ——— Документы (банк-юрист, юрфирма, банк-админ) ———
export const apiGenerateDocument = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      caseId: z.string(),
      kind: z.enum(["PRE_CLAIM", "COURT_PACKAGE", "CALC", "MIB_SUBMISSION", "NOTARY_INSCRIPTION"]),
      title: z.string().min(1).max(300),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!["BANK_ADMIN", "BANK_LEGAL", "LEGAL_FIRM"].includes(u.role)) forbid();
    const c = await requireCaseInScope(u, data.caseId);
    const previews: Record<string, string> = {
      PRE_CLAIM: "Настоящим уведомляем о необходимости погашения задолженности в срок 10 дней...",
      COURT_PACKAGE: "Исковое заявление, расчёт задолженности, копия договора, выписка по счёту...",
      CALC: "Расчёт основного долга, процентов и неустойки на дату...",
      MIB_SUBMISSION: "Сопроводительное письмо в БПИ, копия решения суда, исполнительный документ...",
      NOTARY_INSCRIPTION: "Заявление нотариусу о совершении исполнительной надписи...",
    };
    await prisma.caseDocument.create({
      data: {
        caseId: c.id,
        kind: data.kind,
        title: data.title,
        signedByEds: u.edsOperational,
        bodyPreview: previews[data.kind],
      },
    });
    await audit(u.id, c.id, "DOCUMENT_GENERATED", { kind: data.kind, title: data.title });
    const follow: Partial<Record<string, CaseStatus>> = {
      PRE_CLAIM: "PRE_CLAIM_SENT",
      COURT_PACKAGE: "COURT_PACKAGE_READY",
    };
    const to = follow[data.kind];
    if (to && canTransition(c.status as CaseStatus, to, u.role as UserRole)) {
      await prisma.case.update({ where: { id: c.id }, data: { status: to } });
      await audit(u.id, c.id, "STATUS_CHANGED", { from: c.status, to });
    }
    return { ok: true };
  });

export const apiAddCost = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      caseId: z.string(),
      kind: z.enum(["STORAGE", "EXPERTISE", "LEGAL", "OTHER"]),
      amountUSD: z.number().int().positive().max(10_000_000),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const c = await requireCaseInScope(u, data.caseId);
    await prisma.costEntry.create({
      data: { caseId: c.id, kind: data.kind, amountUSD: data.amountUSD, note: data.note },
    });
    await audit(u.id, c.id, "COST_ADDED", { kind: data.kind, amountUSD: data.amountUSD, note: data.note });
    return { ok: true };
  });

export const apiSetRoute = createServerFn({ method: "POST" })
  .inputValidator(z.object({ caseId: z.string(), route: z.enum(["NOTARY", "COURT"]) }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!["BANK_ADMIN", "BANK_LEGAL"].includes(u.role)) forbid();
    const c = await requireCaseInScope(u, data.caseId);
    await prisma.case.update({
      where: { id: c.id },
      data: { enforcementRoute: data.route, voluntaryPeriodDays: 10 },
    });
    await audit(u.id, c.id, "ROUTE_CHOSEN", { route: data.route });
    return { ok: true };
  });

// ——— Переводы (цепочка Коллектор → Менеджер → Бухгалтер) ———
export const apiInitiateTransfer = createServerFn({ method: "POST" })
  .inputValidator(z.object({ caseId: z.string(), amountUSD: z.number().int().positive().max(100_000_000) }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (u.role !== "COLLECTOR") forbid("Перевод инициирует коллектор агентства");
    const c = await requireCaseInScope(u, data.caseId);
    await prisma.transfer.create({
      data: { caseId: c.id, amountUSD: data.amountUSD, initiatedByUserId: u.id },
    });
    await audit(u.id, c.id, "TRANSFER_INITIATED", { amountUSD: data.amountUSD });
    return { ok: true };
  });

export const apiApproveTransfer = createServerFn({ method: "POST" })
  .inputValidator(z.object({ transferId: z.string() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const t = await prisma.transfer.findUnique({ where: { id: data.transferId }, include: { case: true } });
    if (!t) forbid();
    // Скоуп: менеджер/бухгалтер своей организации
    if (t.case.assignedOrgId !== u.orgId) forbid();
    if (u.role === "MANAGER" && t.status === "INITIATED") {
      await prisma.transfer.update({
        where: { id: t.id },
        data: { status: "MANAGER_APPROVED", managerApprovedByUserId: u.id, managerApprovedAt: new Date() },
      });
      await audit(u.id, t.caseId, "TRANSFER_APPROVED", { role: "MANAGER", transferId: t.id });
      return { ok: true };
    }
    if (u.role === "ACCOUNTANT" && t.status === "MANAGER_APPROVED") {
      await prisma.transfer.update({
        where: { id: t.id },
        data: { status: "COMPLETED", accountantApprovedByUserId: u.id, accountantApprovedAt: new Date() },
      });
      await audit(u.id, t.caseId, "TRANSFER_APPROVED", { role: "ACCOUNTANT", transferId: t.id });
      return { ok: true };
    }
    forbid("Неверный шаг цепочки согласования");
  });

// ——— Списание ———
export const apiWriteOff = createServerFn({ method: "POST" })
  .inputValidator(z.object({ caseId: z.string(), reason: z.string().min(3).max(1000) }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const c = await requireCaseInScope(u, data.caseId);
    if (!canTransition(c.status as CaseStatus, "WRITTEN_OFF", u.role as UserRole))
      return { ok: false, error: "Списание не разрешено для этой роли/статуса" };
    await prisma.case.update({ where: { id: c.id }, data: { status: "WRITTEN_OFF" } });
    await audit(u.id, c.id, "WRITTEN_OFF", {}, data.reason);
    return { ok: true };
  });

// ——— Загрузка портфеля ———
export const apiCreateCases = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      rows: z
        .array(
          z.object({
            pinfl: z.string().regex(/^\d{14}$/),
            name: z.string().min(1).max(200),
            phone: z.string().max(30),
            address: z.string().max(300),
            amountUSD: z.number().int().positive().max(100_000_000),
            collateral: z.boolean(),
            dpd: z.number().int().min(0).max(5000),
          }),
        )
        .max(5000),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (u.role !== "BANK_ADMIN") forbid("Портфель загружает администратор банка");
    await requireActiveOrg(u);
    // Дела создаются в портфеле собственного банка (мультитенантность)
    const bank = await prisma.organization.findUnique({ where: { id: u.orgId } });
    if (!bank || (bank.type !== "BANK" && bank.type !== "MFO")) forbid();
    let created = 0;
    const count = await prisma.case.count();
    for (const [i, r] of data.rows.entries()) {
      const debtor = await prisma.debtor.upsert({
        where: { pinfl: r.pinfl },
        update: {},
        create: { pinfl: r.pinfl, name: r.name, phone: r.phone, address: r.address },
      });
      const code = `TB-2025-${String(9000 + count + i + 1).padStart(4, "0")}`;
      const c = await prisma.case.create({
        data: {
          code,
          tenantBankId: bank.id,
          debtorId: debtor.id,
          amountUSD: r.amountUSD,
          amountUZS: BigInt(r.amountUSD) * 12600n,
          collateral: r.collateral,
          type: r.collateral ? "SECURED" : "UNSECURED",
          dpd: r.dpd,
          originatedAt: new Date(Date.now() - r.dpd * 86400000),
        },
      });
      await audit(u.id, c.id, "PORTFOLIO_UPLOADED", { code, amountUSD: r.amountUSD, dpd: r.dpd });
      created++;
    }
    return { ok: true, created };
  });

// ——— Пользователи: каждая организация управляет только своими ———
// Модель доступа — invite-based provisioning (как в Slack/Notion/Stripe Teams):
// админ вводит e-mail + роль, пароль сотрудник задаёт сам по ссылке из письма.
// Дефолтных паролей не существует; клик по ссылке подтверждает владение почтой.
const canManage = (u: User) => u.role === "BANK_ADMIN" || u.role === "MANAGER";

async function sendInviteEmail(userId: string, email: string, name: string, orgName: string, roleLabel: string) {
  const token = await createResetToken(userId, INVITE_TTL_MS);
  const appUrl = `${getRequestProtocol()}://${getRequestHost({ xForwardedHost: true })}`;
  const res = await sendMail({
    to: email,
    subject: `DebtFlow: вас пригласили в ${orgName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px">
        <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
        <p>Здравствуйте, ${name}!</p>
        <p>Организация <b>${orgName}</b> открыла вам доступ к платформе DebtFlow
           с ролью <b>${roleLabel}</b>.</p>
        <p>Задайте пароль, чтобы активировать учётную запись. Ссылка действует 7 дней.</p>
        <p><a href="${appUrl}/reset-password?token=${token}&welcome=1"
              style="background:#1B3A5C;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">
          Задать пароль и войти</a></p>
        <p style="color:#888;font-size:12px">Единая операционная система взыскания · debtflow.uz</p>
      </div>`,
  });
  logEvent("info", "invite_email", { userId, mailSent: res.ok, mailError: res.error });
  return res;
}

export const apiAddUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orgId: z.string(),
      name: z.string().min(1).max(200),
      email: z.string().email(),
      role: z.enum(["BANK_ADMIN", "BANK_LEGAL", "COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "LEGAL_FIRM", "MANAGER", "ACCOUNTANT"]),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!canManage(u) || data.orgId !== u.orgId)
      return { ok: false as const, error: "Недостаточно прав для этой организации" };
    const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (exists) return { ok: false as const, error: "Пользователь с таким e-mail уже существует" };
    const org = await prisma.organization.findUnique({ where: { id: u.orgId } });
    const created = await prisma.user.create({
      data: {
        orgId: data.orgId,
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        role: data.role,
        // Пароль неизвестен никому: случайный хэш до принятия приглашения
        passwordHash: await hashPassword(crypto.randomUUID() + crypto.randomUUID()),
        emailVerifiedAt: null, // вход невозможен, пока не задан пароль по ссылке
      },
    });
    const roleLabels: Record<string, string> = {
      BANK_ADMIN: "Администратор банка", BANK_LEGAL: "Юрист банка", COLLECTOR: "Коллектор",
      SOFT_COLLECTOR: "Soft-коллектор", HARD_COLLECTOR: "Hard-коллектор",
      LEGAL_FIRM: "Юрист", MANAGER: "Менеджер", ACCOUNTANT: "Бухгалтер",
    };
    const mail = await sendInviteEmail(created.id, created.email, created.name, org?.name ?? "DebtFlow", roleLabels[data.role] ?? data.role);
    return { ok: true as const, mailSent: mail.ok, mailError: mail.error };
  });

// Повторная отправка приглашения (пока оно не принято)
export const apiResendInvite = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const target = await prisma.user.findUnique({ where: { id: data.userId }, include: { org: true } });
    if (!target || !canManage(u) || target.orgId !== u.orgId)
      return { ok: false as const, error: "Недостаточно прав" };
    if (target.emailVerifiedAt)
      return { ok: false as const, error: "Пользователь уже активировал учётную запись" };
    const mail = await sendInviteEmail(target.id, target.email, target.name, target.org.name, target.role);
    return { ok: true as const, mailSent: mail.ok, mailError: mail.error };
  });

export const apiUpdateUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      email: z.string().email().optional(),
      role: z
        .enum(["BANK_ADMIN", "BANK_LEGAL", "COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "LEGAL_FIRM", "MANAGER", "ACCOUNTANT"])
        .optional(),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const target = await prisma.user.findUnique({ where: { id: data.id } });
    if (!target) return { ok: false, error: "Пользователь не найден" };
    if (!canManage(u) || target.orgId !== u.orgId)
      return { ok: false, error: "Недостаточно прав для этой организации" };
    if (data.id === u.id && data.active === false)
      return { ok: false, error: "Нельзя отключить собственную учётную запись" };
    if (data.email) {
      const dupe = await prisma.user.findFirst({
        where: { email: data.email.toLowerCase(), id: { not: data.id } },
      });
      if (dupe) return { ok: false, error: "Этот e-mail уже занят" };
    }
    await prisma.user.update({
      where: { id: data.id },
      data: {
        name: data.name,
        email: data.email?.toLowerCase(),
        role: data.role,
        active: data.active,
      },
    });
    // Отключение доступа немедленно завершает сессии
    if (data.active === false) await prisma.session.deleteMany({ where: { userId: data.id } });
    return { ok: true };
  });

// ——— Полевые выезды (GPS) ———
export const apiStartVisit = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ caseId: z.string(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (u.role !== "COLLECTOR" && u.role !== "HARD_COLLECTOR")
      forbid("Выезды фиксирует выездной коллектор");
    const c = await requireCaseInScope(u, data.caseId);
    const v = await prisma.fieldVisit.create({
      data: { caseId: c.id, collectorUserId: u.id, lat: data.lat, lng: data.lng },
    });
    await audit(u.id, c.id, "VISIT_STARTED", { lat: data.lat, lng: data.lng });
    return { ok: true, visitId: v.id };
  });

export const apiCompleteVisit = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      visitId: z.string(),
      result: z.enum(["CONTACTED", "NO_CONTACT", "PROMISE", "PAYMENT", "REFUSED"]),
      note: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const v = await prisma.fieldVisit.findUnique({ where: { id: data.visitId }, include: { case: true } });
    if (!v || v.collectorUserId !== u.id) forbid("Завершить выезд может только его автор");
    await prisma.fieldVisit.update({
      where: { id: v.id },
      data: { endedAt: new Date(), result: data.result, note: data.note },
    });
    await audit(u.id, v.caseId, "VISIT_COMPLETED", {
      result: data.result,
      lat: v.lat,
      lng: v.lng,
      note: data.note,
    });
    if (
      (data.result === "CONTACTED" || data.result === "NO_CONTACT") &&
      (v.case.status === "ASSIGNED" || v.case.status === "SOFT_COLLECTION") &&
      canTransition(v.case.status as CaseStatus, data.result, u.role as UserRole)
    ) {
      await prisma.case.update({ where: { id: v.caseId }, data: { status: data.result } });
      await audit(u.id, v.caseId, "STATUS_CHANGED", { from: v.case.status, to: data.result });
    }
    return { ok: true };
  });
