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
  createResetToken,
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  isDemoMode,
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

function forbid(msg = "FORBIDDEN"): never {
  throw new Error(msg);
}

// Скоуп дел: банк видит всё, агентства/юрфирмы — только назначенные им
function caseScope(u: User): Prisma.CaseWhereInput {
  return isBank(u) ? {} : { assignedOrgId: u.orgId };
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
    await createSession(user.id);
    logEvent("info", "login_ok", { userId: user.id });
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
      data: { passwordHash: await hashPassword(data.password) },
    });
    // Инвалидация всех сессий после смены пароля
    await prisma.session.deleteMany({ where: { userId } });
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
      // Пользователи: банк видит всех (для назначений/аудита), агентства — свою орг.
      // Пароль-хэши не покидают сервер никогда.
      prisma.user.findMany({
        where: isBank(u) || isDemoMode() ? {} : { orgId: u.orgId },
        select: { id: true, orgId: true, name: true, email: true, role: true, edsOperational: true, active: true },
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
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, type: o.type })),
    users: users.map((x) => ({ ...x, edsOperational: x.edsOperational ?? undefined, role: x.role as UserRole })),
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
    const c = await prisma.case.findUnique({ where: { id: data.caseId } });
    if (!c) forbid();
    const target = await prisma.organization.findUnique({ where: { id: data.toOrgId } });
    if (!target || (target.type !== "COLLECTOR" && target.type !== "LEGAL_FIRM"))
      forbid("Назначать можно только коллекторам и юр. фирмам");
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
    if (!["COLLECTOR", "BANK_ADMIN"].includes(u.role)) forbid();
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
    if (!["COLLECTOR", "BANK_ADMIN"].includes(u.role)) forbid();
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
    if (!["COLLECTOR", "BANK_ADMIN"].includes(u.role)) forbid();
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
    if (u.role !== "COLLECTOR") forbid("Перевод инициирует коллектор");
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
    const bank = await prisma.organization.findFirst({ where: { type: "BANK" } });
    if (!bank) forbid();
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
const canManage = (u: User) => u.role === "BANK_ADMIN" || u.role === "MANAGER";

export const apiAddUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orgId: z.string(),
      name: z.string().min(1).max(200),
      email: z.string().email(),
      role: z.enum(["BANK_ADMIN", "BANK_LEGAL", "COLLECTOR", "LEGAL_FIRM", "MANAGER", "ACCOUNTANT"]),
      password: z.string().min(8).max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (!canManage(u) || data.orgId !== u.orgId)
      return { ok: false, error: "Недостаточно прав для этой организации" };
    const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (exists) return { ok: false, error: "Пользователь с таким e-mail уже существует" };
    await prisma.user.create({
      data: {
        orgId: data.orgId,
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        role: data.role,
        passwordHash: await hashPassword(data.password ?? "demo123"),
      },
    });
    return { ok: true };
  });

export const apiUpdateUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      email: z.string().email().optional(),
      role: z
        .enum(["BANK_ADMIN", "BANK_LEGAL", "COLLECTOR", "LEGAL_FIRM", "MANAGER", "ACCOUNTANT"])
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
    if (u.role !== "COLLECTOR") forbid("Выезды фиксирует коллектор");
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
