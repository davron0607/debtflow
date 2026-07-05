import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type {
  Case,
  CaseEvent,
  CaseEventType,
  CaseStatus,
  DB,
  User,
  UserRole,
  DocumentKind,
  FieldVisit,
  VisitResult,
} from "./types";
import { makeSeed } from "./seed";
import { canTransition } from "../state-machine";

let evtId = 100000;
const newId = (p: string) => `${p}_${(++evtId).toString(36)}`;

export const DEMO_PASSWORD = "demo123";

interface StoreCtx {
  db: DB;
  currentUser: User;
  setCurrentUserId: (id: string) => void;
  // auth (demo: пароль у всех seed-пользователей — "demo123")
  isAuthenticated: boolean;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  // user management (RBAC: BANK_ADMIN — все организации, MANAGER — своя)
  canManageUsers: () => boolean;
  manageableUsers: () => User[];
  addUser: (input: { orgId: string; name: string; email: string; role: UserRole }) => { ok: boolean; error?: string };
  updateUser: (
    id: string,
    patch: Partial<Pick<User, "name" | "email" | "role" | "active" | "edsOperational">>,
  ) => { ok: boolean; error?: string };
  // selectors
  scopedCases: () => Case[];
  caseById: (id: string) => Case | undefined;
  eventsFor: (caseId: string) => CaseEvent[];
  // mutations
  logEvent: (caseId: string, type: CaseEventType, payload?: Record<string, unknown>, reason?: string) => void;
  transitionStatus: (caseId: string, to: CaseStatus, reason?: string) => { ok: boolean; error?: string };
  assignCase: (caseId: string, toOrgId: string, toUserId?: string, reason?: string) => void;
  logContact: (caseId: string, note: string, result: "CONTACTED" | "NO_CONTACT") => void;
  logPromise: (caseId: string, promisedDate: string, amountUSD: number) => void;
  recordPayment: (caseId: string, amountUSD: number, kind: "FULL" | "PARTIAL") => void;
  generateDocument: (caseId: string, kind: DocumentKind, title: string) => void;
  addCost: (caseId: string, kind: "STORAGE" | "EXPERTISE" | "LEGAL" | "OTHER", amountUSD: number, note?: string) => void;
  setEnforcementRoute: (caseId: string, route: "NOTARY" | "COURT") => void;
  initiateTransfer: (caseId: string, amountUSD: number) => void;
  approveTransferAsManager: (transferId: string) => void;
  approveTransferAsAccountant: (transferId: string) => void;
  writeOff: (caseId: string, reason: string) => void;
  createCasesFromRows: (rows: PortfolioRow[]) => number;
  // field visits (GPS)
  scopedVisits: () => FieldVisit[];
  startVisit: (caseId: string, lat: number, lng: number) => { ok: boolean; visitId?: string; error?: string };
  completeVisit: (visitId: string, result: VisitResult, note?: string) => { ok: boolean; error?: string };
}

export interface PortfolioRow {
  pinfl: string;
  name: string;
  phone: string;
  address: string;
  amountUSD: number;
  collateral: boolean;
  dpd: number;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => makeSeed());
  const [currentUserId, setCurrentUserId] = useState<string>("u_admin");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  const currentUser = useMemo(
    () => db.users.find((u) => u.id === currentUserId) ?? db.users[0],
    [db.users, currentUserId],
  );

  const login = useCallback(
    (email: string, password: string) => {
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user) return { ok: false, error: "Пользователь с таким e-mail не найден" };
      if (user.active === false) return { ok: false, error: "Доступ отключён администратором" };
      if (password !== DEMO_PASSWORD) return { ok: false, error: "Неверный пароль" };
      setCurrentUserId(user.id);
      setIsAuthenticated(true);
      return { ok: true };
    },
    [db.users],
  );

  const logout = useCallback(() => setIsAuthenticated(false), []);

  const canManageUsers = useCallback(
    () => currentUser.role === "BANK_ADMIN" || currentUser.role === "MANAGER",
    [currentUser.role],
  );

  const manageableUsers = useCallback((): User[] => {
    if (currentUser.role === "BANK_ADMIN") return db.users;
    if (currentUser.role === "MANAGER") return db.users.filter((u) => u.orgId === currentUser.orgId);
    return [];
  }, [db.users, currentUser]);

  const _canManageOrg = useCallback(
    (orgId: string) =>
      currentUser.role === "BANK_ADMIN" ||
      (currentUser.role === "MANAGER" && orgId === currentUser.orgId),
    [currentUser],
  );

  const addUser = useCallback(
    (input: { orgId: string; name: string; email: string; role: UserRole }) => {
      if (!_canManageOrg(input.orgId)) return { ok: false, error: "Недостаточно прав для этой организации" };
      if (!input.name.trim() || !input.email.trim()) return { ok: false, error: "Имя и e-mail обязательны" };
      if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase()))
        return { ok: false, error: "Пользователь с таким e-mail уже существует" };
      const user: User = {
        id: newId("u"),
        orgId: input.orgId,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        active: true,
      };
      setDb((prev) => ({ ...prev, users: [...prev.users, user] }));
      return { ok: true };
    },
    [_canManageOrg, db.users],
  );

  const updateUser = useCallback(
    (id: string, patch: Partial<Pick<User, "name" | "email" | "role" | "active" | "edsOperational">>) => {
      const target = db.users.find((u) => u.id === id);
      if (!target) return { ok: false, error: "Пользователь не найден" };
      if (!_canManageOrg(target.orgId)) return { ok: false, error: "Недостаточно прав для этой организации" };
      if (id === currentUser.id && patch.active === false)
        return { ok: false, error: "Нельзя отключить собственную учётную запись" };
      if (
        patch.email &&
        db.users.some((u) => u.id !== id && u.email.toLowerCase() === patch.email!.trim().toLowerCase())
      )
        return { ok: false, error: "Этот e-mail уже занят" };
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      }));
      return { ok: true };
    },
    [_canManageOrg, db.users, currentUser.id],
  );

  const scopedCases = useCallback((): Case[] => {
    const role: UserRole = currentUser.role;
    if (role === "BANK_ADMIN" || role === "BANK_LEGAL") return db.cases;
    // agencies/legal firms see only their org's cases (server-side style scoping)
    return db.cases.filter((c) => c.assignedOrgId === currentUser.orgId);
  }, [db.cases, currentUser]);

  const caseById = useCallback((id: string) => db.cases.find((c) => c.id === id), [db.cases]);

  const eventsFor = useCallback(
    (caseId: string) =>
      db.events
        .filter((e) => e.caseId === caseId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [db.events],
  );

  const _pushEvent = useCallback(
    (caseId: string, type: CaseEventType, payload: Record<string, unknown> = {}, reason?: string) => {
      const evt: CaseEvent = {
        id: newId("evt"),
        caseId,
        actorUserId: currentUser.id,
        type,
        payload,
        reason,
        createdAt: new Date().toISOString(),
      };
      setDb((prev) => ({ ...prev, events: [...prev.events, evt] }));
    },
    [currentUser.id],
  );

  const transitionStatus = useCallback(
    (caseId: string, to: CaseStatus, reason?: string) => {
      const c = db.cases.find((x) => x.id === caseId);
      if (!c) return { ok: false, error: "Дело не найдено" };
      if (!canTransition(c.status, to, currentUser.role))
        return { ok: false, error: "Переход не разрешён для этой роли/статуса" };
      setDb((prev) => ({
        ...prev,
        cases: prev.cases.map((x) => (x.id === caseId ? { ...x, status: to } : x)),
        events: [
          ...prev.events,
          {
            id: newId("evt"),
            caseId,
            actorUserId: currentUser.id,
            type: "STATUS_CHANGED",
            payload: { from: c.status, to },
            reason,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      return { ok: true };
    },
    [db.cases, currentUser],
  );

  const assignCase = useCallback(
    (caseId: string, toOrgId: string, toUserId?: string, reason?: string) => {
      const c = db.cases.find((x) => x.id === caseId);
      if (!c) return;
      setDb((prev) => ({
        ...prev,
        cases: prev.cases.map((x) =>
          x.id === caseId
            ? {
                ...x,
                assignedOrgId: toOrgId,
                assignedUserId: toUserId,
                status: x.status === "NEW" ? "ASSIGNED" : x.status,
              }
            : x,
        ),
        assignments: [
          ...prev.assignments,
          {
            id: newId("asg"),
            caseId,
            fromOrgId: c.assignedOrgId,
            toOrgId,
            byUserId: currentUser.id,
            reason,
            at: new Date().toISOString(),
          },
        ],
        events: [
          ...prev.events,
          {
            id: newId("evt"),
            caseId,
            actorUserId: currentUser.id,
            type: c.assignedOrgId ? "REASSIGNED" : "ASSIGNED",
            payload: { toOrgId, fromOrgId: c.assignedOrgId },
            reason,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    },
    [db.cases, currentUser.id],
  );

  const logContact = useCallback(
    (caseId: string, note: string, result: "CONTACTED" | "NO_CONTACT") => {
      _pushEvent(caseId, "CONTACT_LOGGED", { note, result });
      const c = db.cases.find((x) => x.id === caseId);
      if (c && (c.status === "ASSIGNED" || c.status === "SOFT_COLLECTION"))
        transitionStatus(caseId, result);
    },
    [_pushEvent, db.cases, transitionStatus],
  );

  const logPromise = useCallback(
    (caseId: string, promisedDate: string, amountUSD: number) => {
      _pushEvent(caseId, "PROMISE_LOGGED", { promisedDate, amountUSD });
      setDb((prev) => ({
        ...prev,
        payments: [
          ...prev.payments,
          { id: newId("pmt"), caseId, amountUSD, kind: "PROMISE", promisedDate },
        ],
        slas: [
          ...prev.slas,
          { id: newId("sla"), caseId, type: "PROMISE_DUE", dueAt: promisedDate, breached: false },
        ],
      }));
      transitionStatus(caseId, "PROMISE_TO_PAY");
    },
    [_pushEvent, transitionStatus],
  );

  const recordPayment = useCallback(
    (caseId: string, amountUSD: number, kind: "FULL" | "PARTIAL") => {
      _pushEvent(caseId, "PAYMENT_RECORDED", { amountUSD, kind });
      setDb((prev) => ({
        ...prev,
        payments: [
          ...prev.payments,
          { id: newId("pmt"), caseId, amountUSD, kind, paidAt: new Date().toISOString() },
        ],
      }));
      transitionStatus(caseId, kind === "FULL" ? "PAID" : "PARTIALLY_PAID");
    },
    [_pushEvent, transitionStatus],
  );

  const generateDocument = useCallback(
    (caseId: string, kind: DocumentKind, title: string) => {
      _pushEvent(caseId, "DOCUMENT_GENERATED", { kind, title });
      setDb((prev) => ({
        ...prev,
        documents: [
          ...prev.documents,
          {
            id: newId("doc"),
            caseId,
            kind,
            title,
            status: "READY",
            signedByEds: currentUser.edsOperational,
            bodyPreview:
              kind === "PRE_CLAIM"
                ? "Настоящим уведомляем о необходимости погашения задолженности в срок 10 дней..."
                : kind === "COURT_PACKAGE"
                ? "Исковое заявление, расчёт задолженности, копия договора, выписка по счёту..."
                : kind === "CALC"
                ? "Расчёт основного долга, процентов и неустойки на дату..."
                : "Сопроводительное письмо в БПИ, копия решения суда, исполнительный документ...",
            generatedAt: new Date().toISOString(),
          },
        ],
      }));
      if (kind === "PRE_CLAIM") transitionStatus(caseId, "PRE_CLAIM_SENT");
      if (kind === "COURT_PACKAGE") transitionStatus(caseId, "COURT_PACKAGE_READY");
    },
    [_pushEvent, currentUser.edsOperational, transitionStatus],
  );

  const addCost = useCallback(
    (caseId: string, kind: "STORAGE" | "EXPERTISE" | "LEGAL" | "OTHER", amountUSD: number, note?: string) => {
      _pushEvent(caseId, "COST_ADDED", { kind, amountUSD, note });
      setDb((prev) => ({
        ...prev,
        costs: [
          ...prev.costs,
          { id: newId("cst"), caseId, kind, amountUSD, note, createdAt: new Date().toISOString() },
        ],
      }));
    },
    [_pushEvent],
  );

  const setEnforcementRoute = useCallback(
    (caseId: string, route: "NOTARY" | "COURT") => {
      _pushEvent(caseId, "ROUTE_CHOSEN", { route });
      setDb((prev) => ({
        ...prev,
        cases: prev.cases.map((c) =>
          c.id === caseId ? { ...c, enforcementRoute: route, voluntaryPeriodDays: 10 } : c,
        ),
      }));
    },
    [_pushEvent],
  );

  const initiateTransfer = useCallback(
    (caseId: string, amountUSD: number) => {
      _pushEvent(caseId, "TRANSFER_INITIATED", { amountUSD });
      setDb((prev) => ({
        ...prev,
        transfers: [
          ...prev.transfers,
          {
            id: newId("tr"),
            caseId,
            amountUSD,
            initiatedByUserId: currentUser.id,
            initiatedAt: new Date().toISOString(),
            status: "INITIATED",
          },
        ],
      }));
    },
    [_pushEvent, currentUser.id],
  );

  const approveTransferAsManager = useCallback(
    (transferId: string) => {
      setDb((prev) => {
        const t = prev.transfers.find((x) => x.id === transferId);
        if (!t) return prev;
        return {
          ...prev,
          transfers: prev.transfers.map((x) =>
            x.id === transferId
              ? {
                  ...x,
                  status: "MANAGER_APPROVED",
                  managerApprovedByUserId: currentUser.id,
                  managerApprovedAt: new Date().toISOString(),
                }
              : x,
          ),
          events: [
            ...prev.events,
            {
              id: newId("evt"),
              caseId: t.caseId,
              actorUserId: currentUser.id,
              type: "TRANSFER_APPROVED",
              payload: { role: "MANAGER", transferId },
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
    },
    [currentUser.id],
  );

  const approveTransferAsAccountant = useCallback(
    (transferId: string) => {
      setDb((prev) => {
        const t = prev.transfers.find((x) => x.id === transferId);
        if (!t) return prev;
        return {
          ...prev,
          transfers: prev.transfers.map((x) =>
            x.id === transferId
              ? {
                  ...x,
                  status: "COMPLETED",
                  accountantApprovedByUserId: currentUser.id,
                  accountantApprovedAt: new Date().toISOString(),
                }
              : x,
          ),
          events: [
            ...prev.events,
            {
              id: newId("evt"),
              caseId: t.caseId,
              actorUserId: currentUser.id,
              type: "TRANSFER_APPROVED",
              payload: { role: "ACCOUNTANT", transferId },
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
    },
    [currentUser.id],
  );

  const writeOff = useCallback(
    (caseId: string, reason: string) => {
      _pushEvent(caseId, "WRITTEN_OFF", {}, reason);
      transitionStatus(caseId, "WRITTEN_OFF", reason);
    },
    [_pushEvent, transitionStatus],
  );

  const createCasesFromRows = useCallback(
    (rows: PortfolioRow[]) => {
      let created = 0;
      setDb((prev) => {
        const newDebtors = [...prev.debtors];
        const newCases = [...prev.cases];
        const newEvents = [...prev.events];
        rows.forEach((r, i) => {
          let debtor = newDebtors.find((d) => d.pinfl === r.pinfl);
          if (!debtor) {
            debtor = {
              id: newId("deb"),
              pinfl: r.pinfl,
              name: r.name,
              phone: r.phone,
              address: r.address,
            };
            newDebtors.push(debtor);
          }
          const code = `TB-2025-${String(9000 + prev.cases.length + i + 1).padStart(4, "0")}`;
          const c: Case = {
            id: newId("case"),
            code,
            tenantBankId: "org_tenge",
            debtorId: debtor.id,
            amountUSD: r.amountUSD,
            amountUZS: Math.floor(r.amountUSD * 12600),
            collateral: r.collateral,
            type: r.collateral ? "SECURED" : "UNSECURED",
            status: "NEW",
            dpd: r.dpd,
            enforcementRoute: "NONE",
            createdAt: new Date().toISOString(),
            originatedAt: new Date(Date.now() - r.dpd * 86400000).toISOString(),
          };
          newCases.push(c);
          newEvents.push({
            id: newId("evt"),
            caseId: c.id,
            actorUserId: currentUser.id,
            type: "PORTFOLIO_UPLOADED",
            payload: { code, amountUSD: r.amountUSD, dpd: r.dpd },
            createdAt: new Date().toISOString(),
          });
          created++;
        });
        return { ...prev, debtors: newDebtors, cases: newCases, events: newEvents };
      });
      return created;
    },
    [currentUser.id],
  );

  const scopedVisits = useCallback((): FieldVisit[] => {
    if (currentUser.role === "BANK_ADMIN" || currentUser.role === "BANK_LEGAL") return db.visits;
    const orgUserIds = new Set(db.users.filter((u) => u.orgId === currentUser.orgId).map((u) => u.id));
    return db.visits.filter((v) => orgUserIds.has(v.collectorUserId));
  }, [db.visits, db.users, currentUser]);

  const startVisit = useCallback(
    (caseId: string, lat: number, lng: number) => {
      const c = db.cases.find((x) => x.id === caseId);
      if (!c) return { ok: false, error: "Дело не найдено" };
      if (currentUser.role !== "COLLECTOR" && currentUser.role !== "BANK_ADMIN")
        return { ok: false, error: "Выезды фиксирует коллектор" };
      if (c.assignedOrgId !== currentUser.orgId && currentUser.role !== "BANK_ADMIN")
        return { ok: false, error: "Дело не назначено вашей организации" };
      const visit: FieldVisit = {
        id: newId("vis"),
        caseId,
        collectorUserId: currentUser.id,
        lat,
        lng,
        startedAt: new Date().toISOString(),
      };
      setDb((prev) => ({ ...prev, visits: [...prev.visits, visit] }));
      _pushEvent(caseId, "VISIT_STARTED", { lat, lng });
      return { ok: true, visitId: visit.id };
    },
    [db.cases, currentUser, _pushEvent],
  );

  const completeVisit = useCallback(
    (visitId: string, result: VisitResult, note?: string) => {
      const v = db.visits.find((x) => x.id === visitId);
      if (!v) return { ok: false, error: "Выезд не найден" };
      if (v.collectorUserId !== currentUser.id) return { ok: false, error: "Завершить выезд может только его автор" };
      setDb((prev) => ({
        ...prev,
        visits: prev.visits.map((x) =>
          x.id === visitId ? { ...x, endedAt: new Date().toISOString(), result, note } : x,
        ),
      }));
      _pushEvent(v.caseId, "VISIT_COMPLETED", { result, lat: v.lat, lng: v.lng, note });
      if (result === "CONTACTED" || result === "NO_CONTACT") {
        const c = db.cases.find((x) => x.id === v.caseId);
        if (c && (c.status === "ASSIGNED" || c.status === "SOFT_COLLECTION"))
          transitionStatus(v.caseId, result);
      }
      return { ok: true };
    },
    [db.visits, db.cases, currentUser.id, _pushEvent, transitionStatus],
  );

  const value: StoreCtx = {
    db,
    currentUser,
    setCurrentUserId,
    isAuthenticated,
    login,
    logout,
    canManageUsers,
    manageableUsers,
    addUser,
    updateUser,
    scopedCases,
    caseById,
    eventsFor,
    logEvent: _pushEvent,
    transitionStatus,
    assignCase,
    logContact,
    logPromise,
    recordPayment,
    generateDocument,
    addCost,
    setEnforcementRoute,
    initiateTransfer,
    approveTransferAsManager,
    approveTransferAsAccountant,
    writeOff,
    createCasesFromRows,
    scopedVisits,
    startVisit,
    completeVisit,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
