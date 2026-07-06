import type { CaseStatus, UserRole } from "./store/types";

export const STATUS_LABEL: Record<CaseStatus, string> = {
  NEW: "Новое",
  ASSIGNED: "Назначено",
  SOFT_COLLECTION: "Софт-взыскание",
  CONTACTED: "Контакт установлен",
  NO_CONTACT: "Нет контакта",
  PROMISE_TO_PAY: "Обещание оплаты",
  PROMISE_BROKEN: "Обещание нарушено",
  PARTIALLY_PAID: "Частично оплачено",
  PAID: "Оплачено",
  DISPUTE: "Спор",
  RESTRUCTURING_PROPOSED: "Реструктуризация предложена",
  RESTRUCTURED: "Реструктуризировано",
  ESCALATED_TO_LEGAL: "Передано в юр. отдел",
  PRE_CLAIM_SENT: "Претензия направлена",
  COURT_PACKAGE_READY: "Пакет для суда готов",
  FILED_TO_COURT: "Подано в суд",
  COURT_DECISION_RECEIVED: "Решение суда получено",
  READY_FOR_MIB: "Готово для МИБ",
  CLOSED: "Закрыто",
  WRITTEN_OFF: "Списано",
};

export function statusTone(s: CaseStatus): "success" | "destructive" | "neutral" | "money" {
  if (s === "PAID" || s === "CLOSED" || s === "RESTRUCTURED") return "success";
  if (s === "NO_CONTACT" || s === "PROMISE_BROKEN" || s === "DISPUTE" || s === "WRITTEN_OFF")
    return "destructive";
  if (s === "PARTIALLY_PAID" || s === "PROMISE_TO_PAY") return "money";
  return "neutral";
}

export function spineStage(s: CaseStatus): "pre" | "court" | "post" {
  const pre: CaseStatus[] = [
    "NEW", "ASSIGNED", "SOFT_COLLECTION", "CONTACTED", "NO_CONTACT",
    "PROMISE_TO_PAY", "PROMISE_BROKEN", "PARTIALLY_PAID", "DISPUTE",
    "RESTRUCTURING_PROPOSED", "RESTRUCTURED", "ESCALATED_TO_LEGAL", "PRE_CLAIM_SENT",
  ];
  const court: CaseStatus[] = ["COURT_PACKAGE_READY", "FILED_TO_COURT", "COURT_DECISION_RECEIVED"];
  if (pre.includes(s)) return "pre";
  if (court.includes(s)) return "court";
  return "post";
}

type Transition = { to: CaseStatus; roles: UserRole[]; label?: string; destructive?: boolean };

const T: Record<CaseStatus, Transition[]> = {
  NEW: [
    { to: "ASSIGNED", roles: ["BANK_ADMIN"], label: "Назначить агентству" },
  ],
  ASSIGNED: [
    { to: "SOFT_COLLECTION", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "BANK_ADMIN"], label: "Начать софт-взыскание" },
    { to: "ESCALATED_TO_LEGAL", roles: ["BANK_ADMIN"], label: "Эскалация в юр. отдел" },
  ],
  SOFT_COLLECTION: [
    { to: "CONTACTED", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Контакт установлен" },
    { to: "NO_CONTACT", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Нет контакта" },
    { to: "PROMISE_TO_PAY", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Обещание оплаты" },
    { to: "DISPUTE", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "BANK_ADMIN"], label: "Спор" },
    { to: "ESCALATED_TO_LEGAL", roles: ["BANK_ADMIN"], label: "Эскалация" },
  ],
  CONTACTED: [
    { to: "PROMISE_TO_PAY", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Обещание оплаты" },
    { to: "PARTIALLY_PAID", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Частичная оплата" },
    { to: "DISPUTE", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Спор" },
  ],
  NO_CONTACT: [
    { to: "SOFT_COLLECTION", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Возобновить работу" },
    { to: "ESCALATED_TO_LEGAL", roles: ["BANK_ADMIN"], label: "Эскалация" },
  ],
  PROMISE_TO_PAY: [
    { to: "PARTIALLY_PAID", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Частичная оплата" },
    { to: "PAID", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Полная оплата" },
    { to: "PROMISE_BROKEN", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Обещание нарушено" },
  ],
  PROMISE_BROKEN: [
    { to: "SOFT_COLLECTION", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Продолжить" },
    { to: "ESCALATED_TO_LEGAL", roles: ["BANK_ADMIN"], label: "Эскалация" },
  ],
  PARTIALLY_PAID: [
    { to: "PAID", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Полная оплата" },
    { to: "PROMISE_BROKEN", roles: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"], label: "Обещание нарушено" },
  ],
  PAID: [
    { to: "CLOSED", roles: ["BANK_ADMIN"], label: "Закрыть дело" },
  ],
  DISPUTE: [
    { to: "RESTRUCTURING_PROPOSED", roles: ["BANK_ADMIN", "BANK_LEGAL"], label: "Предложить реструктуризацию" },
    { to: "ESCALATED_TO_LEGAL", roles: ["BANK_ADMIN"], label: "В суд" },
  ],
  RESTRUCTURING_PROPOSED: [
    { to: "RESTRUCTURED", roles: ["BANK_ADMIN", "BANK_LEGAL"], label: "Утвердить реструктуризацию" },
    { to: "ESCALATED_TO_LEGAL", roles: ["BANK_ADMIN"], label: "Отказ → в суд" },
  ],
  RESTRUCTURED: [
    { to: "CLOSED", roles: ["BANK_ADMIN"], label: "Закрыть дело" },
  ],
  ESCALATED_TO_LEGAL: [
    { to: "PRE_CLAIM_SENT", roles: ["BANK_LEGAL", "LEGAL_FIRM"], label: "Направить претензию" },
    { to: "COURT_PACKAGE_READY", roles: ["BANK_LEGAL", "LEGAL_FIRM"], label: "Подготовить пакет" },
  ],
  PRE_CLAIM_SENT: [
    { to: "COURT_PACKAGE_READY", roles: ["BANK_LEGAL", "LEGAL_FIRM"], label: "Готовить пакет" },
    { to: "PAID", roles: ["BANK_LEGAL"], label: "Оплачено после претензии" },
  ],
  COURT_PACKAGE_READY: [
    { to: "FILED_TO_COURT", roles: ["BANK_LEGAL", "LEGAL_FIRM"], label: "Подать в суд (вручную)" },
  ],
  FILED_TO_COURT: [
    { to: "COURT_DECISION_RECEIVED", roles: ["BANK_LEGAL", "LEGAL_FIRM"], label: "Получено решение" },
  ],
  COURT_DECISION_RECEIVED: [
    { to: "READY_FOR_MIB", roles: ["BANK_LEGAL", "LEGAL_FIRM"], label: "Готово к передаче в МИБ" },
  ],
  READY_FOR_MIB: [
    { to: "PAID", roles: ["BANK_ADMIN", "BANK_LEGAL"], label: "Взыскано" },
    { to: "WRITTEN_OFF", roles: ["BANK_ADMIN"], label: "Списать", destructive: true },
  ],
  CLOSED: [],
  WRITTEN_OFF: [],
};

export function allowedTransitions(s: CaseStatus, role: UserRole): Transition[] {
  return T[s].filter((t) => t.roles.includes(role));
}

export function canTransition(from: CaseStatus, to: CaseStatus, role: UserRole): boolean {
  return T[from].some((t) => t.to === to && t.roles.includes(role));
}
