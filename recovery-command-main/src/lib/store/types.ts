export type OrgType = "BANK" | "MFO" | "COLLECTOR" | "LEGAL_FIRM" | "PLATFORM";
export type OrgStatus = "PENDING" | "ACTIVE" | "REJECTED";

export type UserRole =
  | "PLATFORM_ADMIN"
  | "BANK_ADMIN"
  | "BANK_LEGAL"
  | "COLLECTOR"
  | "SOFT_COLLECTOR"
  | "HARD_COLLECTOR"
  | "LEGAL_FIRM"
  | "MANAGER"
  | "ACCOUNTANT";

export const ROLE_LABEL: Record<UserRole, string> = {
  PLATFORM_ADMIN: "Оператор платформы",
  BANK_ADMIN: "Администратор банка",
  BANK_LEGAL: "Юрист банка",
  COLLECTOR: "Коллектор (агентство)",
  SOFT_COLLECTOR: "Soft-коллектор (звонки)",
  HARD_COLLECTOR: "Hard-коллектор (выезды)",
  LEGAL_FIRM: "Юридическая фирма",
  MANAGER: "Менеджер (агентство)",
  ACCOUNTANT: "Бухгалтер (агентство)",
};

// Любой коллекторский профиль (агентский или внутрибанковский)
export const COLLECTOR_ROLES: UserRole[] = ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"];
// Роли с правом полевых выездов (GPS)
export const FIELD_ROLES: UserRole[] = ["COLLECTOR", "HARD_COLLECTOR"];

export type CaseStatus =
  | "NEW"
  | "ASSIGNED"
  | "SOFT_COLLECTION"
  | "CONTACTED"
  | "NO_CONTACT"
  | "PROMISE_TO_PAY"
  | "PROMISE_BROKEN"
  | "PARTIALLY_PAID"
  | "PAID"
  | "DISPUTE"
  | "RESTRUCTURING_PROPOSED"
  | "RESTRUCTURED"
  | "ESCALATED_TO_LEGAL"
  | "PRE_CLAIM_SENT"
  | "COURT_PACKAGE_READY"
  | "FILED_TO_COURT"
  | "COURT_DECISION_RECEIVED"
  | "READY_FOR_MIB"
  | "CLOSED"
  | "WRITTEN_OFF";

export type EnforcementRoute = "NONE" | "NOTARY" | "COURT";

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  status?: OrgStatus;
  domain?: string;
}

export interface User {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: UserRole;
  edsOperational?: string; // "signedBy" attribute, removable
  active?: boolean; // false = доступ отключён; по умолчанию активен
  emailVerifiedAt?: string; // null/undefined = приглашение ещё не принято
}

// Роли, доступные организации данного типа
export const ORG_ROLES: Record<OrgType, UserRole[]> = {
  PLATFORM: ["PLATFORM_ADMIN"],
  BANK: ["BANK_ADMIN", "BANK_LEGAL", "SOFT_COLLECTOR", "HARD_COLLECTOR"],
  MFO: ["BANK_ADMIN", "BANK_LEGAL", "SOFT_COLLECTOR", "HARD_COLLECTOR"],
  COLLECTOR: ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "MANAGER", "ACCOUNTANT", "LEGAL_FIRM"],
  LEGAL_FIRM: ["LEGAL_FIRM", "COLLECTOR", "MANAGER", "ACCOUNTANT"],
};

export interface Debtor {
  id: string;
  pinfl: string; // 14 digits
  name: string;
  phone: string;
  address: string;
  assetProfile?: string;
  accountBalancesUSD?: number;
}

export interface Case {
  id: string;
  code: string; // human-readable code, e.g. TB-2025-0007
  tenantBankId: string;
  debtorId: string;
  amountUSD: number;
  amountUZS: number;
  collateral: boolean;
  type: "SECURED" | "UNSECURED";
  status: CaseStatus;
  dpd: number;
  assignedOrgId?: string;
  assignedUserId?: string;
  voluntaryPeriodDays?: number;
  enforcementRoute: EnforcementRoute;
  createdAt: string;
  originatedAt: string; // when loan went overdue
}

export type CaseEventType =
  | "CREATED"
  | "ASSIGNED"
  | "REASSIGNED"
  | "STATUS_CHANGED"
  | "CONTACT_LOGGED"
  | "PROMISE_LOGGED"
  | "PAYMENT_RECORDED"
  | "DOCUMENT_GENERATED"
  | "COST_ADDED"
  | "ROUTE_CHOSEN"
  | "COURT_UPDATE"
  | "MIB_UPDATE"
  | "TRANSFER_INITIATED"
  | "TRANSFER_APPROVED"
  | "WRITTEN_OFF"
  | "CLOSED"
  | "PORTFOLIO_UPLOADED"
  | "VISIT_STARTED"
  | "VISIT_COMPLETED";

export type EventPayload = Record<string, string | number | boolean | null | undefined>;

export interface CaseEvent {
  id: string;
  caseId: string;
  actorUserId: string;
  type: CaseEventType;
  payload: EventPayload;
  result?: string;
  reason?: string;
  createdAt: string;
}

export type DocumentKind =
  | "PRE_CLAIM"
  | "COURT_PACKAGE"
  | "CALC"
  | "MIB_SUBMISSION"
  | "NOTARY_INSCRIPTION";

export interface CaseDocument {
  id: string;
  caseId: string;
  kind: DocumentKind;
  title: string;
  status: "DRAFT" | "READY" | "SENT";
  signedByEds?: string;
  bodyPreview: string;
  generatedAt: string;
}

export interface Payment {
  id: string;
  caseId: string;
  amountUSD: number;
  kind: "FULL" | "PARTIAL" | "PROMISE";
  promisedDate?: string;
  paidAt?: string;
}

export interface CostEntry {
  id: string;
  caseId: string;
  kind: "STORAGE" | "EXPERTISE" | "LEGAL" | "OTHER";
  amountUSD: number;
  note?: string;
  createdAt: string;
}

export interface SlaTimer {
  id: string;
  caseId: string;
  type: string; // "FIRST_CONTACT", "PROMISE_DUE", "COURT_PREP"
  dueAt: string;
  breached: boolean;
}

export interface Assignment {
  id: string;
  caseId: string;
  fromOrgId?: string;
  toOrgId: string;
  byUserId: string;
  reason?: string;
  at: string;
}

export interface Transfer {
  id: string;
  caseId: string;
  amountUSD: number;
  initiatedByUserId: string;
  initiatedAt: string;
  managerApprovedByUserId?: string;
  managerApprovedAt?: string;
  accountantApprovedByUserId?: string;
  accountantApprovedAt?: string;
  status: "INITIATED" | "MANAGER_APPROVED" | "COMPLETED";
}

// Полевой выезд «жёсткого» коллектора с GPS-фиксацией.
// GPS — операционный контроль агентства/банка, не инструмент давления на должника.
export type VisitResult = "CONTACTED" | "NO_CONTACT" | "PROMISE" | "PAYMENT" | "REFUSED";

export interface FieldVisit {
  id: string;
  caseId: string;
  collectorUserId: string;
  lat: number;
  lng: number;
  startedAt: string;
  endedAt?: string;
  result?: VisitResult;
  note?: string;
}

export const VISIT_RESULT_LABEL: Record<VisitResult, string> = {
  CONTACTED: "Контакт состоялся",
  NO_CONTACT: "Нет на месте",
  PROMISE: "Обещание оплаты",
  PAYMENT: "Оплата получена",
  REFUSED: "Отказ от общения",
};

export interface DB {
  orgs: Organization[];
  users: User[];
  debtors: Debtor[];
  cases: Case[];
  events: CaseEvent[];
  documents: CaseDocument[];
  payments: Payment[];
  costs: CostEntry[];
  slas: SlaTimer[];
  assignments: Assignment[];
  transfers: Transfer[];
  visits: FieldVisit[];
}
