// Консоль оператора платформы — серверные функции. Работает с ограниченным
// DB-пользователем: физически не может прочитать Case/Payment/Document
// банков и агентств, даже если бы в коде была ошибка (см. auth.ts и
// scripts/create-admin-console-role.sql в корне монорепозитория).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./backend/db";
import {
  assertSameOrigin,
  checkLoginRateLimit,
  createSession,
  currentUser,
  destroySession,
  requireUser,
  requireUserMutation,
  verifyPassword,
} from "./backend/auth";
import { logEvent } from "./backend/log";
import { sendMail } from "./mail/resend";

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
  return u ? { authenticated: true as const, name: u.name, email: u.email } : { authenticated: false as const };
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
  const results = await Promise.all(
    orgs.map(async (o) => {
      const [userCount, activeUserCount, lastSession, admin] = await Promise.all([
        prisma.user.count({ where: { orgId: o.id } }),
        prisma.user.count({ where: { orgId: o.id, active: true } }),
        prisma.session.findFirst({ where: { user: { orgId: o.id } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.user.findFirst({ where: { orgId: o.id }, orderBy: { createdAt: "asc" }, select: { name: true, email: true } }),
      ]);
      return {
        id: o.id,
        name: o.name,
        type: o.type,
        status: o.status,
        domain: o.domain,
        createdAt: o.createdAt.toISOString(),
        userCount,
        activeUserCount,
        lastActivityAt: lastSession?.createdAt.toISOString() ?? null,
        admin,
      };
    }),
  );
  return results;
});

export const apiSetOrgSuspension = createServerFn({ method: "POST" })
  .inputValidator(z.object({ orgId: z.string(), action: z.enum(["SUSPEND", "REACTIVATE"]), reason: z.string().max(1000).optional() }))
  .handler(async ({ data }) => {
    const u = await requireUserMutation();
    const org = await prisma.organization.findUnique({ where: { id: data.orgId } });
    if (!org) return { ok: false as const, error: "Организация не найдена" };
    if (data.action === "SUSPEND" && !data.reason?.trim())
      return { ok: false as const, error: "Для приостановки обязательна причина" };
    if (data.action === "SUSPEND" && org.status !== "ACTIVE")
      return { ok: false as const, error: "Приостановить можно только активную организацию" };
    if (data.action === "REACTIVATE" && org.status !== "SUSPENDED")
      return { ok: false as const, error: "Организация не приостановлена" };

    const newStatus = data.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
    await prisma.organization.update({ where: { id: org.id }, data: { status: newStatus } });
    if (data.action === "SUSPEND") {
      await prisma.session.deleteMany({ where: { user: { orgId: org.id } } });
    }
    await platformAudit(
      u.id,
      data.action === "SUSPEND" ? "ORG_SUSPENDED" : "ORG_REACTIVATED",
      org.id,
      { orgName: org.name },
      data.reason,
    );
    const admin = await prisma.user.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
    if (admin) {
      await sendMail({
        to: admin.email,
        subject: data.action === "SUSPEND" ? "DebtFlow: доступ организации приостановлен" : "DebtFlow: доступ восстановлен",
        html:
          data.action === "SUSPEND"
            ? `<div style="font-family:Arial,sans-serif;max-width:520px">
                 <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
                 <p>Здравствуйте, ${admin.name}!</p>
                 <p>Доступ организации <b>${org.name}</b> временно приостановлен оператором.</p>
                 <p>Причина: ${data.reason}</p>
               </div>`
            : `<div style="font-family:Arial,sans-serif;max-width:520px">
                 <h2 style="color:#1B3A5C">Debt<span style="color:#3E8E41">Flow</span></h2>
                 <p>Здравствуйте, ${admin.name}!</p>
                 <p>Доступ организации <b>${org.name}</b> восстановлен.</p>
               </div>`,
      });
    }
    return { ok: true as const };
  });

// ——— Журнал действий оператора ———
export const apiAuditLog = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const events = await prisma.platformAuditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
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
