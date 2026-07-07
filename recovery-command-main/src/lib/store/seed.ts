import type {
  Assignment,
  Case,
  CaseDocument,
  CaseEvent,
  CaseStatus,
  CostEntry,
  DB,
  Debtor,
  Organization,
  Payment,
  FieldVisit,
  SlaTimer,
  Transfer,
  User,
  VisitResult,
} from "./types";
import { USD_TO_UZS } from "../format";

const BANK_ID = "org_tenge";
const AGENCY_A_ID = "org_ag_alpha";
const AGENCY_B_ID = "org_ag_beta";
const LEGAL_ID = "org_lf_lex";

let idc = 0;
const id = (p: string) => `${p}_${(++idc).toString(36)}`;

const orgs: Organization[] = [
  { id: BANK_ID, name: "Tenge Bank", type: "BANK" },
  { id: AGENCY_A_ID, name: 'КА "Альфа-Взыскание"', type: "COLLECTOR" },
  { id: AGENCY_B_ID, name: 'КА "Бета-Ресурс"', type: "COLLECTOR" },
  { id: LEGAL_ID, name: 'ЮФ "Lex Partners"', type: "LEGAL_FIRM" },
];

const users: User[] = [
  { id: "u_admin", orgId: BANK_ID, name: "Дилшод Каримов", email: "admin@tengebank.uz", role: "BANK_ADMIN" },
  { id: "u_legal", orgId: BANK_ID, name: "Мадина Юсупова", email: "legal@tengebank.uz", role: "BANK_LEGAL", edsOperational: "EDS-TB-0042" },
  { id: "u_collector_a", orgId: AGENCY_A_ID, name: "Азиз Рахимов", email: "aziz@alpha-collect.uz", role: "COLLECTOR" },
  { id: "u_manager_a", orgId: AGENCY_A_ID, name: "Севара Ахмедова", email: "sevara@alpha-collect.uz", role: "MANAGER" },
  { id: "u_acc_a", orgId: AGENCY_A_ID, name: "Бекзод Норов", email: "bekzod@alpha-collect.uz", role: "ACCOUNTANT" },
  { id: "u_collector_b", orgId: AGENCY_B_ID, name: "Улугбек Ташматов", email: "ulugbek@beta-resource.uz", role: "COLLECTOR" },
  { id: "u_lawyer", orgId: LEGAL_ID, name: "Нилуфар Саидова", email: "n.saidova@lex.uz", role: "LEGAL_FIRM", edsOperational: "EDS-LEX-0117" },
];

const uzbekNames = [
  "Отабек Хасанов", "Зарина Абдуллаева", "Санжар Мирзаев", "Мохира Тураева",
  "Жасур Исмаилов", "Гулнора Каримова", "Рустам Юлдашев", "Дилноза Хужаева",
  "Шерзод Норматов", "Феруза Азимова", "Бахтиёр Собиров", "Азиза Расулова",
  "Кахрамон Эргашев", "Юлдуз Насриддинова", "Иброхим Пулатов", "Малика Ниязова",
  "Фарход Умаров", "Севара Джалилова", "Комил Артыков", "Мадина Хамидова",
  "Абдулла Худайбергенов", "Наргиза Юсупова", "Тимур Рахматов", "Оксана Ким",
  "Равшан Мамадиев", "Диёра Хайдарова", "Санжарбек Абдуллаев", "Ирода Мансурова",
  "Улугбек Ходжаев", "Лола Азизова", "Мурод Юсуфов", "Камола Ахмедова",
  "Хикмат Раззаков", "Нозима Тохирова", "Дилшод Хусанов", "Барно Пирмухамедова",
  "Абдурахмон Каюмов", "Мехринисо Уразова", "Азамат Джураев", "Шахзода Икрамова",
];

const streets = [
  "ул. Амира Темура", "ул. Мустакиллик", "пр. Навои", "ул. Шота Руставели",
  "ул. Богишамол", "ул. Мукими", "ул. Бабура", "ул. Фаргона Йули",
];

function mkPinfl(seed: number): string {
  // 14 digits, deterministic
  const base = (10000000000000n + BigInt(seed) * 1234567n).toString();
  return base.slice(0, 14).padStart(14, "0");
}

const rnd = (() => {
  let s = 42;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
})();

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

const debtors: Debtor[] = uzbekNames.map((name, i) => ({
  id: `deb_${i + 1}`,
  pinfl: mkPinfl(i + 1),
  name,
  phone: `+998 ${90 + Math.floor(rnd() * 10)} ${100 + Math.floor(rnd() * 900)}-${10 + Math.floor(rnd() * 90)}-${10 + Math.floor(rnd() * 90)}`,
  address: `г. Ташкент, ${pick(streets)}, д. ${1 + Math.floor(rnd() * 120)}`,
  assetProfile: rnd() > 0.5 ? "квартира, авто" : "не установлено",
  accountBalancesUSD: rnd() > 0.7 ? Math.floor(rnd() * 3000) : 0,
}));

// Build ~40 cases across DPD buckets and statuses
const STATUSES: { s: CaseStatus; dpdMin: number; dpdMax: number }[] = [
  { s: "NEW", dpdMin: 5, dpdMax: 15 },
  { s: "ASSIGNED", dpdMin: 8, dpdMax: 25 },
  { s: "SOFT_COLLECTION", dpdMin: 12, dpdMax: 30 },
  { s: "CONTACTED", dpdMin: 15, dpdMax: 35 },
  { s: "PROMISE_TO_PAY", dpdMin: 20, dpdMax: 45 },
  { s: "PROMISE_BROKEN", dpdMin: 35, dpdMax: 55 },
  { s: "NO_CONTACT", dpdMin: 25, dpdMax: 50 },
  { s: "PARTIALLY_PAID", dpdMin: 25, dpdMax: 50 },
  { s: "DISPUTE", dpdMin: 30, dpdMax: 60 },
  { s: "ESCALATED_TO_LEGAL", dpdMin: 62, dpdMax: 85 },
  { s: "PRE_CLAIM_SENT", dpdMin: 65, dpdMax: 88 },
  { s: "COURT_PACKAGE_READY", dpdMin: 75, dpdMax: 95 },
  { s: "FILED_TO_COURT", dpdMin: 95, dpdMax: 130 },
  { s: "COURT_DECISION_RECEIVED", dpdMin: 130, dpdMax: 180 },
  { s: "READY_FOR_MIB", dpdMin: 160, dpdMax: 220 },
  { s: "PAID", dpdMin: 40, dpdMax: 90 },
  { s: "CLOSED", dpdMin: 60, dpdMax: 200 },
  { s: "RESTRUCTURED", dpdMin: 45, dpdMax: 90 },
  { s: "WRITTEN_OFF", dpdMin: 220, dpdMax: 400 },
];

const cases: Case[] = [];
const events: CaseEvent[] = [];
const docs: CaseDocument[] = [];
const payments: Payment[] = [];
const costs: CostEntry[] = [];
const slas: SlaTimer[] = [];
const assignments: Assignment[] = [];
const transfers: Transfer[] = [];

const now = new Date();
function daysAgo(d: number): string {
  return new Date(now.getTime() - d * 86400000).toISOString();
}
function daysFromNow(d: number): string {
  return new Date(now.getTime() + d * 86400000).toISOString();
}

let counter = 1;
for (let i = 0; i < 40; i++) {
  const debtor = debtors[i];
  const bucket = STATUSES[i % STATUSES.length];
  const dpd = Math.floor(bucket.dpdMin + rnd() * (bucket.dpdMax - bucket.dpdMin));
  const collateral = rnd() > 0.55;
  const amountUSD = Math.floor((1500 + rnd() * 45000) / 50) * 50;
  const originated = daysAgo(dpd);
  const createdAt = daysAgo(Math.max(0, dpd - 3));

  const status = bucket.s;
  const isPostAssign = !["NEW"].includes(status);
  const isPostLegal = [
    "ESCALATED_TO_LEGAL", "PRE_CLAIM_SENT", "COURT_PACKAGE_READY", "FILED_TO_COURT",
    "COURT_DECISION_RECEIVED", "READY_FOR_MIB",
  ].includes(status);

  const assignedOrgId = isPostLegal
    ? LEGAL_ID
    : isPostAssign
    ? (i % 2 === 0 ? AGENCY_A_ID : AGENCY_B_ID)
    : undefined;

  const assignedUserId = assignedOrgId === LEGAL_ID
    ? "u_lawyer"
    : assignedOrgId === AGENCY_A_ID
    ? "u_collector_a"
    : assignedOrgId === AGENCY_B_ID
    ? "u_collector_b"
    : undefined;

  const enforcementRoute = isPostLegal
    ? (collateral ? "COURT" : rnd() > 0.5 ? "COURT" : "NOTARY")
    : "NONE";

  const c: Case = {
    id: id("case"),
    code: `TB-2025-${String(counter++).padStart(4, "0")}`,
    tenantBankId: BANK_ID,
    debtorId: debtor.id,
    amountUSD,
    amountUZS: Math.floor(amountUSD * USD_TO_UZS),
    collateral,
    type: collateral ? "SECURED" : "UNSECURED",
    status,
    dpd,
    assignedOrgId,
    assignedUserId,
    enforcementRoute,
    voluntaryPeriodDays: enforcementRoute !== "NONE" ? 10 : undefined,
    createdAt,
    originatedAt: originated,
  };
  cases.push(c);

  // seed events
  events.push({
    id: id("evt"),
    caseId: c.id,
    actorUserId: "u_admin",
    type: "CREATED",
    payload: { code: c.code, amountUSD, dpd },
    createdAt,
  });
  if (assignedOrgId) {
    const assignAt = daysAgo(Math.max(0, dpd - 5));
    assignments.push({
      id: id("asg"),
      caseId: c.id,
      toOrgId: assignedOrgId,
      byUserId: "u_admin",
      at: assignAt,
    });
    events.push({
      id: id("evt"),
      caseId: c.id,
      actorUserId: "u_admin",
      type: "ASSIGNED",
      payload: { toOrgId: assignedOrgId },
      createdAt: assignAt,
    });
  }
  if (status === "PROMISE_TO_PAY" || status === "PROMISE_BROKEN") {
    const promiseDate = daysFromNow(status === "PROMISE_BROKEN" ? -5 : 7);
    payments.push({
      id: id("pmt"),
      caseId: c.id,
      amountUSD,
      kind: "PROMISE",
      promisedDate: promiseDate,
    });
    events.push({
      id: id("evt"),
      caseId: c.id,
      actorUserId: assignedUserId ?? "u_collector_a",
      type: "PROMISE_LOGGED",
      payload: { promisedDate: promiseDate, amountUSD },
      createdAt: daysAgo(3),
    });
    slas.push({
      id: id("sla"),
      caseId: c.id,
      type: "PROMISE_DUE",
      dueAt: promiseDate,
      breached: status === "PROMISE_BROKEN",
    });
  }
  if (status === "PARTIALLY_PAID" || status === "PAID" || status === "CLOSED") {
    const paidAmt = status === "PARTIALLY_PAID" ? Math.floor(amountUSD * 0.3) : amountUSD;
    payments.push({
      id: id("pmt"),
      caseId: c.id,
      amountUSD: paidAmt,
      kind: status === "PARTIALLY_PAID" ? "PARTIAL" : "FULL",
      paidAt: daysAgo(2),
    });
    events.push({
      id: id("evt"),
      caseId: c.id,
      actorUserId: assignedUserId ?? "u_collector_a",
      type: "PAYMENT_RECORDED",
      payload: { amountUSD: paidAmt },
      createdAt: daysAgo(2),
    });
  }
  if (isPostLegal) {
    docs.push({
      id: id("doc"),
      caseId: c.id,
      kind: "PRE_CLAIM",
      title: `Претензионное письмо ${c.code}`,
      status: "SENT",
      signedByEds: "EDS-LEX-0117",
      bodyPreview: `Настоящим уведомляем о задолженности в размере ${amountUSD} USD...`,
      generatedAt: daysAgo(20),
    });
    events.push({
      id: id("evt"),
      caseId: c.id,
      actorUserId: "u_lawyer",
      type: "DOCUMENT_GENERATED",
      payload: { kind: "PRE_CLAIM" },
      createdAt: daysAgo(20),
    });
    if (status !== "ESCALATED_TO_LEGAL" && status !== "PRE_CLAIM_SENT") {
      docs.push({
        id: id("doc"),
        caseId: c.id,
        kind: "COURT_PACKAGE",
        title: `Пакет для суда ${c.code}`,
        status: "READY",
        signedByEds: "EDS-LEX-0117",
        bodyPreview: `Исковое заявление, расчёт задолженности, договор, выписка...`,
        generatedAt: daysAgo(12),
      });
    }
    costs.push({
      id: id("cst"),
      caseId: c.id,
      kind: "LEGAL",
      amountUSD: 120 + Math.floor(rnd() * 300),
      note: "Госпошлина + подготовка иска",
      createdAt: daysAgo(15),
    });
    if (collateral) {
      costs.push({
        id: id("cst"),
        caseId: c.id,
        kind: "STORAGE",
        amountUSD: 40 + Math.floor(rnd() * 200),
        note: "Стоянка залогового авто",
        createdAt: daysAgo(10),
      });
    }
    if (rnd() > 0.6) {
      costs.push({
        id: id("cst"),
        caseId: c.id,
        kind: "EXPERTISE",
        amountUSD: 80 + Math.floor(rnd() * 250),
        note: "Оценочная экспертиза",
        createdAt: daysAgo(8),
      });
    }
  }
  if (["FILED_TO_COURT", "COURT_DECISION_RECEIVED", "READY_FOR_MIB"].includes(status)) {
    slas.push({
      id: id("sla"),
      caseId: c.id,
      type: "COURT_HEARING",
      dueAt: daysFromNow(rnd() > 0.5 ? 10 : -3),
      breached: rnd() > 0.7,
    });
  }
  if (assignedOrgId && !slas.find((s) => s.caseId === c.id && s.type === "FIRST_CONTACT")) {
    slas.push({
      id: id("sla"),
      caseId: c.id,
      type: "FIRST_CONTACT",
      dueAt: daysAgo(dpd - 8),
      breached: !["CONTACTED", "PROMISE_TO_PAY", "PARTIALLY_PAID", "PAID"].includes(status),
    });
  }
}

// A pending transfer for demo
const paidCase = cases.find((c) => c.status === "PAID");
if (paidCase) {
  transfers.push({
    id: id("tr"),
    caseId: paidCase.id,
    amountUSD: paidCase.amountUSD,
    initiatedByUserId: "u_collector_a",
    initiatedAt: daysAgo(1),
    status: "INITIATED",
  });
  events.push({
    id: id("evt"),
    caseId: paidCase.id,
    actorUserId: "u_collector_a",
    type: "TRANSFER_INITIATED",
    payload: { amountUSD: paidCase.amountUSD },
    createdAt: daysAgo(1),
  });
}

// Полевые выезды коллекторов (GPS): последние 7 дней, координаты районов Ташкента
const visits: FieldVisit[] = [];
{
  const TASHKENT = { lat: 41.311, lng: 69.28 };
  const visitCollectors = ["u_collector_a", "u_collector_b"];
  const visitResults: VisitResult[] = ["CONTACTED", "NO_CONTACT", "PROMISE", "PAYMENT", "REFUSED"];
  visitCollectors.forEach((uid) => {
    const orgId = users.find((u) => u.id === uid)!.orgId;
    const myCases = cases.filter((c) => c.assignedOrgId === orgId).slice(0, 8);
    myCases.forEach((c, i) => {
      const started = new Date(now.getTime() - (i % 6) * 86400000 - (2 + (i % 5)) * 3600000);
      const result = visitResults[Math.floor(rnd() * visitResults.length)];
      const v: FieldVisit = {
        id: id("vis"),
        caseId: c.id,
        collectorUserId: uid,
        lat: TASHKENT.lat + (rnd() - 0.5) * 0.12,
        lng: TASHKENT.lng + (rnd() - 0.5) * 0.16,
        startedAt: started.toISOString(),
        endedAt: new Date(started.getTime() + (10 + rnd() * 35) * 60000).toISOString(),
        result,
        note: result === "PROMISE" ? "Обещал оплату до конца недели" : undefined,
      };
      visits.push(v);
      events.push({
        id: id("evt"),
        caseId: c.id,
        actorUserId: uid,
        type: "VISIT_COMPLETED",
        payload: { result, lat: v.lat, lng: v.lng },
        createdAt: v.endedAt!,
      });
    });
  });
}

export function makeSeed(): DB {
  return {
    orgs,
    users,
    debtors,
    cases,
    events,
    documents: docs,
    payments,
    costs,
    slas,
    assignments,
    transfers,
    visits,
  };
}
