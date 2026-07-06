// Сид производственной БД: переносит демо-генератор в Postgres.
// Пароль всех демо-пользователей: demo123 (bcrypt-хэш).
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { makeSeed } from "../src/lib/store/seed";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("БД уже засеяна — пропускаю. (`prisma migrate reset` для пересева)");
    return;
  }

  const db = makeSeed();
  const passwordHash = await bcrypt.hash("demo123", 12);

  await prisma.organization.createMany({
    data: db.orgs.map((o) => ({ id: o.id, name: o.name, type: o.type })),
  });
  await prisma.user.createMany({
    data: db.users.map((u) => ({
      id: u.id,
      orgId: u.orgId,
      name: u.name,
      email: u.email,
      role: u.role,
      edsOperational: u.edsOperational,
      passwordHash,
      emailVerifiedAt: new Date(),
    })),
  });
  await prisma.debtor.createMany({
    data: db.debtors.map((d) => ({
      id: d.id,
      pinfl: d.pinfl,
      name: d.name,
      phone: d.phone,
      address: d.address,
      assetProfile: d.assetProfile,
      accountBalancesUSD: d.accountBalancesUSD,
    })),
  });
  await prisma.case.createMany({
    data: db.cases.map((c) => ({
      id: c.id,
      code: c.code,
      tenantBankId: c.tenantBankId,
      debtorId: c.debtorId,
      amountUSD: c.amountUSD,
      amountUZS: BigInt(c.amountUZS),
      collateral: c.collateral,
      type: c.type,
      status: c.status,
      dpd: c.dpd,
      assignedOrgId: c.assignedOrgId,
      assignedUserId: c.assignedUserId,
      voluntaryPeriodDays: c.voluntaryPeriodDays,
      enforcementRoute: c.enforcementRoute,
      createdAt: new Date(c.createdAt),
      originatedAt: new Date(c.originatedAt),
    })),
  });
  await prisma.caseEvent.createMany({
    data: db.events.map((e) => ({
      id: e.id,
      caseId: e.caseId,
      actorUserId: e.actorUserId,
      type: e.type,
      payload: e.payload as Prisma.InputJsonObject,
      result: e.result,
      reason: e.reason,
      createdAt: new Date(e.createdAt),
    })),
  });
  await prisma.caseDocument.createMany({
    data: db.documents.map((d) => ({
      id: d.id,
      caseId: d.caseId,
      kind: d.kind,
      title: d.title,
      status: d.status,
      signedByEds: d.signedByEds,
      bodyPreview: d.bodyPreview,
      generatedAt: new Date(d.generatedAt),
    })),
  });
  await prisma.payment.createMany({
    data: db.payments.map((p) => ({
      id: p.id,
      caseId: p.caseId,
      amountUSD: p.amountUSD,
      kind: p.kind,
      promisedDate: p.promisedDate ? new Date(p.promisedDate) : null,
      paidAt: p.paidAt ? new Date(p.paidAt) : null,
    })),
  });
  await prisma.costEntry.createMany({
    data: db.costs.map((k) => ({
      id: k.id,
      caseId: k.caseId,
      kind: k.kind,
      amountUSD: k.amountUSD,
      note: k.note,
      createdAt: new Date(k.createdAt),
    })),
  });
  await prisma.slaTimer.createMany({
    data: db.slas.map((s) => ({
      id: s.id,
      caseId: s.caseId,
      type: s.type,
      dueAt: new Date(s.dueAt),
      breached: s.breached,
    })),
  });
  await prisma.assignment.createMany({
    data: db.assignments.map((a) => ({
      id: a.id,
      caseId: a.caseId,
      fromOrgId: a.fromOrgId,
      toOrgId: a.toOrgId,
      byUserId: a.byUserId,
      reason: a.reason,
      at: new Date(a.at),
    })),
  });
  await prisma.transfer.createMany({
    data: db.transfers.map((t) => ({
      id: t.id,
      caseId: t.caseId,
      amountUSD: t.amountUSD,
      initiatedByUserId: t.initiatedByUserId,
      initiatedAt: new Date(t.initiatedAt),
      status: t.status,
    })),
  });
  await prisma.fieldVisit.createMany({
    data: db.visits.map((v) => ({
      id: v.id,
      caseId: v.caseId,
      collectorUserId: v.collectorUserId,
      lat: v.lat,
      lng: v.lng,
      startedAt: new Date(v.startedAt),
      endedAt: v.endedAt ? new Date(v.endedAt) : null,
      result: v.result,
      note: v.note,
    })),
  });

  console.log(
    `Засеяно: ${db.orgs.length} орг, ${db.users.length} пользователей, ${db.cases.length} дел, ${db.events.length} событий.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
