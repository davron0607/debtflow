// Decision Engine — детерминированные правила поверх событий (V1).
// V2: те же интерфейсы, но вероятности считает предиктивная модель,
// обученная на CaseEvent-истории, которая уже собирается.

import type { Case, CaseStatus, DB, Organization, UserRole } from "./store/types";
import { canTransition } from "./state-machine";

export type RecoActionKey =
  | "ASSIGN"
  | "CALL"
  | "VISIT"
  | "FOLLOW_UP_PROMISE"
  | "ESCALATE_LEGAL"
  | "SEND_NOTARY"
  | "SEND_COURT"
  | "FILE_COURT"
  | "RESTRUCTURE"
  | "WRITE_OFF"
  | "TRACK_MIB";

export interface CaseSignals {
  failedContacts: number;
  contacts: number;
  promisesBroken: number;
  visits: number;
  hasAssets: boolean;
  hasBalance: boolean;
  paidUSD: number;
  costsUSD: number;
  slaBreached: number;
}

export interface CaseReco {
  action: RecoActionKey;
  label: string; // кнопка
  reasons: string[];
  confidence: number; // 0-100
  expectedRecoveryUSD: number;
  probability: number; // 0-100
  risk: "LOW" | "MEDIUM" | "HIGH";
  // исполнение
  targetStatus?: CaseStatus;
  route?: "NOTARY" | "COURT";
  needsReason?: boolean;
  approverRoles: UserRole[];
}

const TERMINAL: CaseStatus[] = ["PAID", "CLOSED", "WRITTEN_OFF", "RESTRUCTURED"];

export function caseSignals(db: DB, c: Case): CaseSignals {
  const events = db.events.filter((e) => e.caseId === c.id);
  const contactsAll = events.filter((e) => e.type === "CONTACT_LOGGED");
  const failedContacts =
    contactsAll.filter((e) => e.payload["result"] === "NO_CONTACT").length +
    db.visits.filter((v) => v.caseId === c.id && (v.result === "NO_CONTACT" || v.result === "REFUSED")).length;
  const promisesBroken =
    events.filter((e) => e.type === "STATUS_CHANGED" && e.payload["to"] === "PROMISE_BROKEN").length +
    (c.status === "PROMISE_BROKEN" ? 1 : 0);
  const debtor = db.debtors.find((d) => d.id === c.debtorId);
  return {
    failedContacts,
    contacts: contactsAll.length,
    promisesBroken,
    visits: db.visits.filter((v) => v.caseId === c.id).length,
    hasAssets: !!debtor?.assetProfile && debtor.assetProfile !== "не установлено",
    hasBalance: (debtor?.accountBalancesUSD ?? 0) > 0,
    paidUSD: db.payments.filter((p) => p.caseId === c.id && p.paidAt).reduce((s, p) => s + p.amountUSD, 0),
    costsUSD: db.costs.filter((k) => k.caseId === c.id).reduce((s, k) => s + k.amountUSD, 0),
    slaBreached: db.slas.filter((s) => s.caseId === c.id && s.breached).length,
  };
}

export function recoveryProbability(db: DB, c: Case): number {
  const s = caseSignals(db, c);
  let p = 60;
  p -= Math.min(30, c.dpd / 10); // старение долга
  if (c.collateral) p += 18;
  if (s.hasAssets) p += 12;
  if (s.hasBalance) p += 8;
  p -= s.promisesBroken * 8;
  p -= Math.min(20, s.failedContacts * 4);
  if (s.paidUSD > 0) p += 10; // уже платил
  if (["FILED_TO_COURT", "COURT_DECISION_RECEIVED", "READY_FOR_MIB"].includes(c.status)) p += 8;
  if (c.status === "DISPUTE") p -= 10;
  return Math.max(4, Math.min(95, Math.round(p)));
}

// Оценка судебных/нотариальных издержек (демо-константы V1)
export function legalCosts(c: Case) {
  const court = Math.max(300, Math.round(c.amountUSD * 0.02)); // госпошлина + ведение
  const notary = Math.max(80, Math.round(c.amountUSD * 0.004)); // исполнительная надпись
  return { court, notary };
}

// Рекомендация исполнима только той ролью, которой state machine разрешает переход
function gate(c: Case, reco: CaseReco): CaseReco | null {
  if (!reco.targetStatus) return reco;
  const roles = reco.approverRoles.filter((r) => canTransition(c.status, reco.targetStatus!, r));
  if (roles.length === 0) return null;
  return { ...reco, approverRoles: roles };
}

export function caseReco(db: DB, c: Case): CaseReco | null {
  const r = caseRecoRaw(db, c);
  return r ? gate(c, r) : null;
}

function caseRecoRaw(db: DB, c: Case): CaseReco | null {
  if (TERMINAL.includes(c.status)) return null;
  const s = caseSignals(db, c);
  const prob = recoveryProbability(db, c);
  const expected = Math.round((c.amountUSD * prob) / 100);
  const { court, notary } = legalCosts(c);
  const risk: CaseReco["risk"] = prob >= 60 ? "LOW" : prob >= 35 ? "MEDIUM" : "HIGH";
  const base = { probability: prob, risk, expectedRecoveryUSD: expected };

  // 1. Не назначено → назначить
  if (!c.assignedOrgId || c.status === "NEW") {
    const best = suggestAgencies(db, c)[0];
    return {
      ...base,
      action: "ASSIGN",
      label: best ? `Назначить: ${best.org.name}` : "Назначить агентство",
      reasons: best ? best.reasons : ["Дело не в работе — портфель стареет"],
      confidence: best?.score ?? 60,
      approverRoles: ["BANK_ADMIN"],
    };
  }

  // 2. Экономика хуже нуля → реструктуризация или списание
  const cheapestLegal = Math.min(court, notary);
  if (expected - s.costsUSD - cheapestLegal <= 0) {
    const canRestructure = s.paidUSD > 0 || s.contacts > 0;
    return {
      ...base,
      action: canRestructure ? "RESTRUCTURE" : "WRITE_OFF",
      label: canRestructure ? "Предложить реструктуризацию" : "Списать (нерентабельно)",
      reasons: [
        `Ожидаемое взыскание ${prob}% ≈ $${expected.toLocaleString()}`,
        `Расходы уже $${s.costsUSD.toLocaleString()} + юр. минимум $${cheapestLegal.toLocaleString()}`,
        canRestructure ? "Должник идёт на контакт — шанс договориться" : "Контакта нет, активов недостаточно",
      ],
      confidence: 80,
      targetStatus: canRestructure ? "RESTRUCTURING_PROPOSED" : "WRITTEN_OFF",
      needsReason: !canRestructure,
      approverRoles: ["BANK_ADMIN", "BANK_LEGAL"],
    };
  }

  // 3. Пакет готов → подать
  if (c.status === "COURT_PACKAGE_READY") {
    return {
      ...base,
      action: "FILE_COURT",
      label: "Подать в суд",
      reasons: ["Судебный пакет сформирован", `Ожидаемое взыскание $${expected.toLocaleString()}`],
      confidence: 90,
      targetStatus: "FILED_TO_COURT",
      approverRoles: ["BANK_ADMIN", "BANK_LEGAL", "LEGAL_FIRM"],
    };
  }
  if (c.status === "COURT_DECISION_RECEIVED") {
    return {
      ...base,
      action: "TRACK_MIB",
      label: "Готово к МИБ",
      reasons: ["Решение суда получено — исполнительный документ в МИБ"],
      confidence: 92,
      targetStatus: "READY_FOR_MIB",
      approverRoles: ["BANK_ADMIN", "BANK_LEGAL", "LEGAL_FIRM"],
    };
  }
  if (["FILED_TO_COURT", "READY_FOR_MIB", "PRE_CLAIM_SENT", "ESCALATED_TO_LEGAL"].includes(c.status)) {
    return null; // процесс идёт по плану
  }

  // 4. Жёсткая просрочка + активы → принудительный маршрут
  const hardCase = c.dpd > 60 && (s.promisesBroken >= 1 || s.failedContacts >= 2 || c.dpd > 90);
  if (hardCase && (s.hasAssets || s.hasBalance || c.collateral)) {
    const disputed = c.status === "DISPUTE";
    const reasons = [
      `${s.failedContacts} неудачных контактов`,
      ...(s.promisesBroken ? [`Обещание нарушено: ${s.promisesBroken} раз`] : []),
      ...(s.hasAssets ? ["Есть имущество"] : []),
      ...(s.hasBalance ? ["Есть остатки на счетах"] : []),
      disputed ? "Долг оспаривается — только суд" : `Нотариус дешевле суда ($${notary} vs $${court})`,
    ];
    return {
      ...base,
      action: disputed ? "SEND_COURT" : "SEND_NOTARY",
      label: disputed ? "Эскалировать в суд" : "Маршрут: нотариус (исп. надпись)",
      reasons,
      confidence: disputed ? 78 : 85,
      targetStatus: "ESCALATED_TO_LEGAL",
      route: disputed ? "COURT" : "NOTARY",
      approverRoles: ["BANK_ADMIN", "BANK_LEGAL"],
    };
  }
  if (hardCase) {
    return {
      ...base,
      action: "ESCALATE_LEGAL",
      label: "Эскалировать юристам",
      reasons: [`DPD ${c.dpd} — готовить пакет заранее`, `${s.failedContacts} неудачных контактов`],
      confidence: 74,
      targetStatus: "ESCALATED_TO_LEGAL",
      approverRoles: ["BANK_ADMIN"],
    };
  }

  // 5. Обещание оплаты → контроль
  if (c.status === "PROMISE_TO_PAY") {
    const promise = db.payments.find((p) => p.caseId === c.id && p.kind === "PROMISE" && p.promisedDate);
    const overdue = promise && new Date(promise.promisedDate!) < new Date();
    return {
      ...base,
      action: "FOLLOW_UP_PROMISE",
      label: overdue ? "Обещание просрочено — позвонить" : "Контроль обещания",
      reasons: [
        promise ? `Обещано $${promise.amountUSD.toLocaleString()} до ${promise.promisedDate!.slice(0, 10)}` : "Обещание зафиксировано",
        ...(s.promisesBroken ? ["Ранее уже нарушал — вероятность низкая"] : []),
      ],
      confidence: overdue ? 88 : 65,
      approverRoles: ["COLLECTOR", "BANK_ADMIN"],
    };
  }

  // 6. Мягкая стадия → контакт/выезд
  const noContact = c.status === "NO_CONTACT" || c.status === "PROMISE_BROKEN";
  return {
    ...base,
    action: noContact ? "VISIT" : "CALL",
    label: noContact ? "Запланировать выезд" : "Позвонить должнику",
    reasons: [
      `DPD ${c.dpd} — мягкое взыскание`,
      noContact ? "Телефонный контакт не работает — нужен выезд" : "Ранний контакт удваивает возврат",
    ],
    confidence: 62,
    approverRoles: ["COLLECTOR", "BANK_ADMIN"],
  };
}

// ——— Assignment Engine ———

export interface AgencySuggestion {
  org: Organization;
  score: number; // 0-100 (confidence)
  recoveryRate: number;
  openCases: number;
  slaScore: number;
  reasons: string[];
}

export function agencyStats(db: DB, org: Organization) {
  const cs = db.cases.filter((c) => c.assignedOrgId === org.id);
  const total = cs.reduce((s, c) => s + c.amountUSD, 0);
  const paid = db.payments
    .filter((p) => p.paidAt && cs.some((c) => c.id === p.caseId))
    .reduce((s, p) => s + p.amountUSD, 0);
  const recoveryRate = total > 0 ? (paid / total) * 100 : 0;
  const openCases = cs.filter((c) => !TERMINAL.includes(c.status)).length;
  const slaTotal = db.slas.filter((s) => cs.some((c) => c.id === s.caseId)).length;
  const slaBreached = db.slas.filter((s) => s.breached && cs.some((c) => c.id === s.caseId)).length;
  const slaScore = slaTotal > 0 ? ((slaTotal - slaBreached) / slaTotal) * 100 : 100;
  const securedShare = cs.length ? cs.filter((c) => c.collateral).length / cs.length : 0;
  const disputes = cs.filter((c) => c.status === "DISPUTE").length;
  return { recoveryRate, openCases, slaScore, securedShare, disputes, total, paid, count: cs.length };
}

export function suggestAgencies(db: DB, c: Case): AgencySuggestion[] {
  const partners = db.orgs.filter((o) => o.type === "COLLECTOR" || o.type === "LEGAL_FIRM");
  const maxOpen = Math.max(1, ...partners.map((o) => agencyStats(db, o).openCases));
  const legalStage = c.dpd > 60;
  return partners
    .map((org) => {
      const st = agencyStats(db, org);
      const reasons: string[] = [];
      let score = 30;
      score += Math.min(35, st.recoveryRate * 1.2);
      if (st.recoveryRate >= 15) reasons.push(`Лучший возврат: ${st.recoveryRate.toFixed(0)}%`);
      const loadPenalty = (st.openCases / maxOpen) * 15;
      score -= loadPenalty;
      if (st.openCases / maxOpen < 0.6) reasons.push(`Низкая загрузка (${st.openCases} дел)`);
      score += (st.slaScore - 50) / 5;
      if (st.slaScore >= 80) reasons.push(`Дисциплина SLA ${st.slaScore.toFixed(0)}%`);
      if (c.collateral && st.securedShare > 0.4) {
        score += 8;
        reasons.push("Опыт залоговых дел");
      }
      if (legalStage && org.type === "LEGAL_FIRM") {
        score += 12;
        reasons.push("Юридическая стадия — профильная фирма");
      }
      if (!legalStage && org.type === "LEGAL_FIRM") score -= 10;
      return { org, score: Math.max(10, Math.min(96, Math.round(score))), recoveryRate: st.recoveryRate, openCases: st.openCases, slaScore: st.slaScore, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

// ——— Agency verdicts ———

export function agencyVerdict(db: DB, org: Organization): { verdict: string; tone: "success" | "warning" | "destructive"; action?: "REASSIGN" } {
  const st = agencyStats(db, org);
  if (st.count === 0) return { verdict: "Нет дел — назначить пилотный пакет", tone: "warning" };
  if (st.recoveryRate >= 15 && st.slaScore >= 70) return { verdict: "Продлить договор, увеличить долю портфеля", tone: "success" };
  if (st.recoveryRate >= 6) return { verdict: `Наблюдение: возврат ${st.recoveryRate.toFixed(0)}%, дать 30 дней на улучшение`, tone: "warning" };
  return { verdict: `Возврат ${st.recoveryRate.toFixed(1)}% — перераспределить открытые дела`, tone: "destructive", action: "REASSIGN" };
}

// ——— Portfolio-level ———

export function portfolioBrief(db: DB, cases: Case[]) {
  const open = cases.filter((c) => !TERMINAL.includes(c.status));
  const recos = open
    .map((c) => ({ c, r: caseReco(db, c) }))
    .filter((x): x is { c: Case; r: CaseReco } => !!x.r);
  const atRisk = open
    .filter((c) => recoveryProbability(db, c) < 35)
    .reduce((s, c) => s + c.amountUSD, 0);
  const promisesBroken = open.filter((c) => c.status === "PROMISE_BROKEN").length;
  const slaBreaches = db.slas.filter((s) => s.breached && open.some((c) => c.id === s.caseId)).length;
  const hearingsSoon = db.slas.filter(
    (s) =>
      s.type === "COURT_HEARING" &&
      !s.breached &&
      new Date(s.dueAt).getTime() - Date.now() < 3 * 86400000 &&
      open.some((c) => c.id === s.caseId),
  ).length;
  const expected30d = Math.round(
    open.reduce((s, c) => s + (c.amountUSD * recoveryProbability(db, c)) / 100, 0) * 0.25,
  );
  const byAction = new Map<RecoActionKey, { cases: Case[]; expected: number }>();
  recos.forEach(({ c, r }) => {
    const g = byAction.get(r.action) ?? { cases: [], expected: 0 };
    g.cases.push(c);
    g.expected += r.expectedRecoveryUSD;
    byAction.set(r.action, g);
  });
  return { recos, atRisk, promisesBroken, slaBreaches, hearingsSoon, expected30d, byAction, needAction: recos.length };
}
