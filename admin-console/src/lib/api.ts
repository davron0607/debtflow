// Консоль оператора платформы — серверные функции. Работает с ограниченным
// DB-пользователем: физически не может прочитать Case/Payment/Document
// банков и агентств, даже если бы в коде была ошибка (см. auth.ts и
// scripts/create-admin-console-role.sql в корне монорепозитория).
import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma, OrgStatus } from "@prisma/client";
import { prisma } from "./backend/db";
import {
  assertSameOrigin,
  checkLoginRateLimit,
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  requireUser,
  requireUserMutation,
  verifyPassword,
} from "./backend/auth";
import { logEvent } from "./backend/log";
import { sendMail } from "./mail/resend";

function generateTempPassword(): string {
  // Читаемый временный пароль: 4 группы по 4 base32-символа (без 0/O/1/I).
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i % 4 === 3 && i !== 15) out += "-";
  }
  return out;
}

async function platformAudit(
  actorUserId: string,
  type: string,
  targetOrgId?: string,
  payload: Record<string, unknown> = {},
  reason?: string,
) {
  await prisma.platformAuditEvent.create({
    data: { actorUserId, targetOrgId, type, payload: payload as Prisma.InputJsonObject, reason },
  });
  logEvent("info", "platform_action", { type, actorUserId, targetOrgId, reason });
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
    const fail = { ok: false as const, error: "Неверный e-mail или пароль" };
    if (!user || user.role !== "PLATFORM_ADMIN") {
      logEvent("warn", "login_failed", { reason: "not_platform_admin" });
      return fail;
    }
    if (!user.active) return { ok: false as const, error: "Учётная запись отключена" };
    if (!(await verifyPassword(data.password, user.passwordHash))) {
      logEvent("warn", "login_failed", { userId: user.id, reason: "bad_password" });
      return fail;
    }
    await createSession(user.id);
    logEvent("info", "login_ok", { userId: user.id });
    return { ok: true as const };
  });

export const apiLogout = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true };
});

export const apiWhoAmI = createServerFn({ method: "GET" }).handler(async () => {
  const u = await currentUser();
  return u
    ? { authenticated: true as const, name: u.name, email: u.email, isReadOnly: u.operatorLevel === "READ_ONLY" }
    : { authenticated: false as const };
});

// ——— Заявки на проверке ———
const TYPE_LABEL_SET = ["BANK", "MFO", "COLLECTOR", "LEGAL_FIRM"] as const;

export const apiModerationList = createServerFn({ method: "GET" }).handler(async () => {
  const u = await requireUser();
  const orgs = await prisma.organization.findMany({
    where: { status: { in: ["PENDING", "REJECTED"] }, type: { in: [...TYPE_LABEL_SET] } },
    include: {
      users: {
        select: { name: true, email: true, role: true, emailVerifiedAt: true, createdAt: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  void u;
  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    status: o.status,
    domain: o.domain,
    createdAt: o.createdAt.toISOString(),
    admin: o.users[0]
      ? { name: o.users[0].name, email: o.users[0].email, emailVerified: !!o.users[0].emailVerifiedAt }
      : null,
  }));
});

export const apiModerateOrg = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ orgId: z.string(), decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().max(1000).optional() }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const org = await prisma.organization.findUnique({
      where: { id: data.orgId },
      include: { users: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!org) return { ok: false as const, error: "Организация не найдена" };
    if (data.decision === "REJECT" && !data.reason?.trim())
      return { ok: false as const, error: "Для отклонения обязательна причина" };
    const status = data.decision === "APPROVE" ? "ACTIVE" : "REJECTED";
    await prisma.organization.update({ where: { id: org.id }, data: { status } });
    await platformAudit(u.id, "ORG_MODERATED", org.id, { decision: data.decision, orgName: org.name }, data.reason);
    const admin = org.users[0];
    if (admin) {
      await sendMail({
        to: admin.email,
        subject: data.decision === "APPROVE" ? "DebtFlow: организация одобрена" : "DebtFlow: заявка отклонена",
        html:
          data.decision === "APPROVE"
            ? `<div style="font-family:Arial,sans-serif;max-width:520px">
                 <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
                 <p>Здравствуйте, ${admin.name}!</p>
                 <p>Организация <b>${org.name}</b> прошла проверку. Полный доступ открыт.</p>
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

// ——— Все организации + телеметрия ———
export const apiOrgList = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const orgs = await prisma.organization.findMany({
    where: { type: { in: [...TYPE_LABEL_SET] } },
    orderBy: { createdAt: "desc" },
  });
  // "Свои" дела для банков/МФО — где организация выступает кредитором
  // (tenantBankId). Для агентств/юрфирм — дела, которые им сейчас назначены
  // (assignedOrgId). Читаем только 4 не-конфиденциальные колонки Case (id,
  // tenantBankId, assignedOrgId, status, createdAt) — суммы, документы,
  // должник и т.д. по-прежнему недоступны этой роли (см. create-admin-console-role.sql).
  const OWNER_TYPES = new Set(["BANK", "MFO"]);
  const CLOSED_STATUSES = ["CLOSED", "WRITTEN_OFF"] as const;

  const results = await Promise.all(
    orgs.map(async (o) => {
      const scopeField = OWNER_TYPES.has(o.type) ? "tenantBankId" : "assignedOrgId";
      const [userCount, activeUserCount, lastSession, admin, caseCount, activeCaseCount] = await Promise.all([
        prisma.user.count({ where: { orgId: o.id } }),
        prisma.user.count({ where: { orgId: o.id, active: true } }),
        prisma.session.findFirst({ where: { user: { orgId: o.id } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.user.findFirst({ where: { orgId: o.id }, orderBy: { createdAt: "asc" }, select: { name: true, email: true } }),
        prisma.case.count({ where: { [scopeField]: o.id } }),
        prisma.case.count({ where: { [scopeField]: o.id, status: { notIn: [...CLOSED_STATUSES] } } }),
      ]);
      return {
        id: o.id,
        name: o.name,
        type: o.type,
        status: o.status,
        domain: o.domain,
        createdAt: o.createdAt.toISOString(),
        plan: o.plan,
        maxUsers: o.maxUsers,
        maxCases: o.maxCases,
        userCount,
        activeUserCount,
        caseCount,
        activeCaseCount,
        lastActivityAt: lastSession?.createdAt.toISOString() ?? null,
        admin,
      };
    }),
  );
  return results;
});

export const apiUpdateOrgQuotas = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orgId: z.string(),
      plan: z.string().min(1).max(60),
      maxUsers: z.number().int().positive().nullable(),
      maxCases: z.number().int().positive().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const org = await prisma.organization.findUnique({ where: { id: data.orgId } });
    if (!org) return { ok: false as const, error: "Организация не найдена" };
    await prisma.organization.update({
      where: { id: org.id },
      data: { plan: data.plan.trim(), maxUsers: data.maxUsers, maxCases: data.maxCases },
    });
    await platformAudit(u.id, "ORG_QUOTAS_UPDATED", org.id, {
      orgName: org.name,
      plan: data.plan,
      maxUsers: data.maxUsers,
      maxCases: data.maxCases,
    });
    return { ok: true as const };
  });

const ORG_ACTION_EMAIL: Record<string, { subject: string; body: (orgName: string, reason?: string) => string }> = {
  SUSPEND: {
    subject: "DebtFlow: доступ организации приостановлен",
    body: (orgName, reason) => `
      <p>Доступ организации <b>${orgName}</b> временно приостановлен оператором.</p>
      <p>Причина: ${reason}</p>`,
  },
  REACTIVATE: {
    subject: "DebtFlow: доступ восстановлен",
    body: (orgName) => `<p>Доступ организации <b>${orgName}</b> восстановлен.</p>`,
  },
  ARCHIVE: {
    subject: "DebtFlow: организация закрыта",
    body: (orgName, reason) => `
      <p>Организация <b>${orgName}</b> закрыта оператором платформы. Вход сотрудников отключён.</p>
      <p>Причина: ${reason}</p>`,
  },
  RESTORE: {
    subject: "DebtFlow: организация восстановлена",
    body: (orgName) => `<p>Организация <b>${orgName}</b> восстановлена оператором платформы, доступ открыт снова.</p>`,
  },
};

const ORG_ACTION_STATUS: Record<string, { from: OrgStatus[]; to: OrgStatus; event: string; needsReason: boolean }> = {
  SUSPEND: { from: ["ACTIVE"], to: "SUSPENDED", event: "ORG_SUSPENDED", needsReason: true },
  REACTIVATE: { from: ["SUSPENDED"], to: "ACTIVE", event: "ORG_REACTIVATED", needsReason: false },
  ARCHIVE: { from: ["ACTIVE", "SUSPENDED"], to: "ARCHIVED", event: "ORG_ARCHIVED", needsReason: true },
  RESTORE: { from: ["ARCHIVED"], to: "ACTIVE", event: "ORG_RESTORED", needsReason: false },
};

// Массовые действия над организациями: приостановка/восстановление/архивация,
// поддерживает как один orgId, так и выбор нескольких сразу.
export const apiBulkOrgAction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      orgIds: z.array(z.string()).min(1),
      action: z.enum(["SUSPEND", "REACTIVATE", "ARCHIVE", "RESTORE"]),
      reason: z.string().max(1000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const spec = ORG_ACTION_STATUS[data.action];
    if (spec.needsReason && !data.reason?.trim())
      return { ok: false as const, error: "Для этого действия обязательна причина" };

    const orgs = await prisma.organization.findMany({ where: { id: { in: data.orgIds } } });
    const eligible = orgs.filter((o) => spec.from.includes(o.status));
    const skipped = orgs.length - eligible.length;

    for (const org of eligible) {
      await prisma.organization.update({ where: { id: org.id }, data: { status: spec.to } });
      if (data.action === "SUSPEND" || data.action === "ARCHIVE") {
        await prisma.session.deleteMany({ where: { user: { orgId: org.id } } });
      }
      await platformAudit(u.id, spec.event, org.id, { orgName: org.name }, data.reason);
      const admin = await prisma.user.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
      const email = ORG_ACTION_EMAIL[data.action];
      if (admin) {
        await sendMail({ to: admin.email, subject: email.subject, html: emailShell(admin.name, email.body(org.name, data.reason)) });
      }
    }
    return { ok: true as const, updated: eligible.length, skipped };
  });

function emailShell(name: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:520px">
    <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
    <p>Здравствуйте, ${name}!</p>
    ${bodyHtml}
  </div>`;
}

// ——— Журнал действий оператора ———
export const apiAuditLog = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      type: z.string().optional(),
      orgQuery: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireUser();
    const where: Prisma.PlatformAuditEventWhereInput = {};
    if (data.type) where.type = data.type;
    if (data.from || data.to) {
      where.createdAt = {
        ...(data.from ? { gte: new Date(data.from) } : {}),
        ...(data.to ? { lte: new Date(data.to) } : {}),
      };
    }
    if (data.orgQuery?.trim()) {
      const matchingOrgs = await prisma.organization.findMany({
        where: { name: { contains: data.orgQuery.trim(), mode: "insensitive" } },
        select: { id: true },
      });
      where.targetOrgId = { in: matchingOrgs.map((o) => o.id) };
    }
    const events = await prisma.platformAuditEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
    const orgIds = [...new Set(events.map((e) => e.targetOrgId).filter((x): x is string => !!x))];
    const orgs = await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
    const orgById = new Map(orgs.map((o) => [o.id, o.name]));
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      targetOrgId: e.targetOrgId,
      targetOrgName: e.targetOrgId ? orgById.get(e.targetOrgId) ?? null : null,
      payload: e.payload,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    }));
  });

// ——— Дашборд метрик платформы ———
export const apiDashboardStats = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const [orgs, users, totalCases, activeCases] = await Promise.all([
    prisma.organization.findMany({
      where: { type: { in: [...TYPE_LABEL_SET] } },
      select: { id: true, status: true, type: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { role: { not: "PLATFORM_ADMIN" } },
      select: { id: true, active: true, createdAt: true },
    }),
    // Дела считаются только по банкам/МФО (tenantBankId) — иначе агентские
    // назначения задвоили бы общий счётчик. Только count, без чтения строк.
    prisma.case.count({ where: { tenantBank: { type: { in: ["BANK", "MFO"] } } } }),
    prisma.case.count({
      where: { tenantBank: { type: { in: ["BANK", "MFO"] } }, status: { notIn: ["CLOSED", "WRITTEN_OFF"] } },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const o of orgs) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    byType[o.type] = (byType[o.type] ?? 0) + 1;
  }

  const now = new Date();
  const weeks: { weekStart: string; orgs: number; users: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 86_400_000);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    weeks.push({
      weekStart: start.toISOString(),
      orgs: orgs.filter((o) => o.createdAt >= start && o.createdAt < end).length,
      users: users.filter((u) => u.createdAt >= start && u.createdAt < end).length,
    });
  }

  return {
    totalOrgs: orgs.length,
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.active).length,
    totalCases,
    activeCases,
    byStatus,
    byType,
    weeks,
  };
});

// ——— Пользователи организаций (саппорт: сброс пароля, блокировка, сессии) ———
export const apiUserList = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const users = await prisma.user.findMany({
    where: { role: { not: "PLATFORM_ADMIN" } },
    include: {
      org: { select: { id: true, name: true } },
      sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      _count: { select: { sessions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    orgId: u.org.id,
    orgName: u.org.name,
    lastSessionAt: u.sessions[0]?.createdAt.toISOString() ?? null,
    activeSessionCount: u._count.sessions,
  }));
});

export const apiResetUserPassword = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target || target.role === "PLATFORM_ADMIN") return { ok: false as const, error: "Пользователь не найден" };
    const tempPassword = generateTempPassword();
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(tempPassword) } });
    await prisma.session.deleteMany({ where: { userId: target.id } });
    await platformAudit(u.id, "USER_PASSWORD_RESET", target.orgId, { userId: target.id, email: target.email });
    await sendMail({
      to: target.email,
      subject: "DebtFlow: пароль сброшен оператором",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px">
               <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
               <p>Здравствуйте, ${target.name}!</p>
               <p>Оператор платформы сбросил пароль вашей учётной записи. Временный пароль:</p>
               <p style="font-size:18px;font-weight:bold;letter-spacing:1px">${tempPassword}</p>
               <p>Войдите с ним и сразу задайте новый пароль в настройках профиля. Все прежние сеансы завершены.</p>
             </div>`,
    });
    return { ok: true as const };
  });

export const apiSetUserActive = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target || target.role === "PLATFORM_ADMIN") return { ok: false as const, error: "Пользователь не найден" };
    await prisma.user.update({ where: { id: target.id }, data: { active: data.active } });
    if (!data.active) await prisma.session.deleteMany({ where: { userId: target.id } });
    await platformAudit(
      u.id,
      data.active ? "USER_UNLOCKED" : "USER_BLOCKED",
      target.orgId,
      { userId: target.id, email: target.email },
    );
    return { ok: true as const };
  });

export const apiForceLogoutUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target || target.role === "PLATFORM_ADMIN") return { ok: false as const, error: "Пользователь не найден" };
    const { count } = await prisma.session.deleteMany({ where: { userId: target.id } });
    await platformAudit(u.id, "USER_SESSIONS_REVOKED", target.orgId, { userId: target.id, email: target.email, count });
    return { ok: true as const, count };
  });

// ——— Команда операторов платформы (сам PLATFORM_ADMIN) ———
export const apiOperatorList = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const operators = await prisma.user.findMany({
    where: { role: "PLATFORM_ADMIN" },
    include: { sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  return operators.map((o) => ({
    id: o.id,
    name: o.name,
    email: o.email,
    active: o.active,
    level: o.operatorLevel ?? "FULL",
    lastSessionAt: o.sessions[0]?.createdAt.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  }));
});

export const apiInviteOperator = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(200),
      email: z.string().email(),
      level: z.enum(["FULL", "READ_ONLY"]),
    }),
  )
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { ok: false as const, error: "Пользователь с таким e-mail уже существует" };
    const platformOrg = await prisma.organization.findFirst({ where: { type: "PLATFORM" } });
    if (!platformOrg) return { ok: false as const, error: "Организация платформы не найдена" };
    const tempPassword = generateTempPassword();
    const created = await prisma.user.create({
      data: {
        orgId: platformOrg.id,
        name: data.name.trim(),
        email,
        passwordHash: await hashPassword(tempPassword),
        role: "PLATFORM_ADMIN",
        operatorLevel: data.level,
        emailVerifiedAt: new Date(),
      },
    });
    await platformAudit(u.id, "OPERATOR_INVITED", undefined, { userId: created.id, email, level: data.level });
    await sendMail({
      to: email,
      subject: "DebtFlow: доступ к консоли оператора платформы",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px">
               <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
               <p>Здравствуйте, ${data.name}!</p>
               <p>Вам открыт доступ к консоли оператора платформы (${data.level === "FULL" ? "полный доступ" : "только просмотр"}).</p>
               <p>E-mail: <b>${email}</b><br/>Временный пароль: <b>${tempPassword}</b></p>
               <p>Войдите и сразу задайте новый пароль.</p>
             </div>`,
    });
    return { ok: true as const };
  });

export const apiSetOperatorLevel = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string(), level: z.enum(["FULL", "READ_ONLY"]) }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (data.userId === u.id) return { ok: false as const, error: "Нельзя изменить уровень доступа самому себе" };
    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target || target.role !== "PLATFORM_ADMIN") return { ok: false as const, error: "Оператор не найден" };
    await prisma.user.update({ where: { id: target.id }, data: { operatorLevel: data.level } });
    await platformAudit(u.id, "OPERATOR_LEVEL_CHANGED", undefined, { userId: target.id, email: target.email, level: data.level });
    return { ok: true as const };
  });

export const apiSetOperatorActive = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    if (data.userId === u.id) return { ok: false as const, error: "Нельзя деактивировать самого себя" };
    const target = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!target || target.role !== "PLATFORM_ADMIN") return { ok: false as const, error: "Оператор не найден" };
    await prisma.user.update({ where: { id: target.id }, data: { active: data.active } });
    if (!data.active) await prisma.session.deleteMany({ where: { userId: target.id } });
    await platformAudit(
      u.id,
      data.active ? "OPERATOR_REACTIVATED" : "OPERATOR_DEACTIVATED",
      undefined,
      { userId: target.id, email: target.email },
    );
    return { ok: true as const };
  });
