// Клиентский стор: тот же интерфейс useStore(), но данные и безопасность —
// на сервере (Postgres + Prisma + RBAC). Клиент держит только снапшот,
// разрешённый текущей роли, и инвалидирует его после мутаций.
import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Case, CaseEvent, CaseStatus, DB, FieldVisit, User, UserRole, DocumentKind, VisitResult } from "./types";
import {
  apiLogin,
  apiLogout,
  apiSwitchUser,
  apiSnapshot,
  apiTransition,
  apiAssign,
  apiLogContact,
  apiLogPromise,
  apiRecordPayment,
  apiGenerateDocument,
  apiAddCost,
  apiSetRoute,
  apiInitiateTransfer,
  apiApproveTransfer,
  apiWriteOff,
  apiCreateCases,
  apiAddUser,
  apiUpdateUser,
  apiStartVisit,
  apiCompleteVisit,
} from "../api";

export const DEMO_PASSWORD = "demo123";

type Result = { ok: boolean; error?: string };

interface StoreCtx {
  db: DB;
  currentUser: User;
  isAuthenticated: boolean;
  demoMode: boolean;
  setCurrentUserId: (id: string) => Promise<void>;
  login: (email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  // selectors
  scopedCases: () => Case[];
  caseById: (id: string) => Case | undefined;
  eventsFor: (caseId: string) => CaseEvent[];
  scopedVisits: () => FieldVisit[];
  // user management
  canManageUsers: () => boolean;
  manageableUsers: () => User[];
  addUser: (input: { orgId: string; name: string; email: string; role: UserRole }) => Promise<Result>;
  updateUser: (
    id: string,
    patch: Partial<Pick<User, "name" | "email" | "role" | "active">>,
  ) => Promise<Result>;
  // mutations
  transitionStatus: (caseId: string, to: CaseStatus, reason?: string) => Promise<Result>;
  assignCase: (caseId: string, toOrgId: string, toUserId?: string, reason?: string) => Promise<Result>;
  logContact: (caseId: string, note: string, result: "CONTACTED" | "NO_CONTACT") => Promise<Result>;
  logPromise: (caseId: string, promisedDate: string, amountUSD: number) => Promise<Result>;
  recordPayment: (caseId: string, amountUSD: number, kind: "FULL" | "PARTIAL") => Promise<Result>;
  generateDocument: (caseId: string, kind: DocumentKind, title: string) => Promise<Result>;
  addCost: (
    caseId: string,
    kind: "STORAGE" | "EXPERTISE" | "LEGAL" | "OTHER",
    amountUSD: number,
    note?: string,
  ) => Promise<Result>;
  setEnforcementRoute: (caseId: string, route: "NOTARY" | "COURT") => Promise<Result>;
  initiateTransfer: (caseId: string, amountUSD: number) => Promise<Result>;
  approveTransferAsManager: (transferId: string) => Promise<Result>;
  approveTransferAsAccountant: (transferId: string) => Promise<Result>;
  writeOff: (caseId: string, reason: string) => Promise<Result>;
  createCasesFromRows: (rows: PortfolioRow[]) => Promise<number>;
  startVisit: (caseId: string, lat: number, lng: number) => Promise<Result & { visitId?: string }>;
  completeVisit: (visitId: string, result: VisitResult, note?: string) => Promise<Result>;
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

const EMPTY_DB: DB = {
  orgs: [],
  users: [],
  debtors: [],
  cases: [],
  events: [],
  documents: [],
  payments: [],
  costs: [],
  slas: [],
  assignments: [],
  transfers: [],
  visits: [],
};

const GUEST: User = {
  id: "",
  orgId: "",
  name: "Гость",
  email: "",
  role: "COLLECTOR",
  active: false,
};

const Ctx = createContext<StoreCtx | null>(null);

async function call<T extends Result>(p: Promise<T>, invalidate: () => Promise<void>): Promise<T> {
  try {
    const r = await p;
    await invalidate();
    return r;
  } catch (e) {
    await invalidate();
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("FORBIDDEN") ? "Недостаточно прав" : msg } as T;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["snapshot"],
    queryFn: () => apiSnapshot(),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const invalidate = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["snapshot"] });
  }, [qc]);

  const authenticated = data?.authenticated === true;
  const db: DB = authenticated ? data.db : EMPTY_DB;
  const currentUser: User = authenticated ? { ...data.currentUser } : GUEST;
  const demoMode = authenticated ? data.demoMode : true;

  const scopedCases = useCallback(() => db.cases, [db.cases]);
  const caseById = useCallback((id: string) => db.cases.find((c) => c.id === id), [db.cases]);
  const eventsFor = useCallback(
    (caseId: string) =>
      db.events.filter((e) => e.caseId === caseId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [db.events],
  );
  const scopedVisits = useCallback(() => db.visits, [db.visits]);

  const canManageUsers = useCallback(
    () => currentUser.role === "BANK_ADMIN" || currentUser.role === "MANAGER",
    [currentUser.role],
  );
  const manageableUsers = useCallback(
    () => (canManageUsers() ? db.users.filter((u) => u.orgId === currentUser.orgId) : []),
    [db.users, currentUser.orgId, canManageUsers],
  );

  const value: StoreCtx = useMemo(
    () => ({
      db,
      currentUser,
      isAuthenticated: authenticated,
      demoMode,
      setCurrentUserId: async (id) => {
        await apiSwitchUser({ data: { userId: id } }).catch(() => {});
        await invalidate();
      },
      login: async (email, password) => {
        const r = await apiLogin({ data: { email, password } });
        await invalidate();
        return r;
      },
      logout: async () => {
        await apiLogout();
        await invalidate();
      },
      scopedCases,
      caseById,
      eventsFor,
      scopedVisits,
      canManageUsers,
      manageableUsers,
      // PLATFORM_ADMIN не создаётся через UI — только bootstrap-скриптом
      addUser: (input) =>
        call(apiAddUser({ data: { ...input, role: input.role as Exclude<UserRole, "PLATFORM_ADMIN"> } }), invalidate),
      updateUser: (id, patch) =>
        call(
          apiUpdateUser({ data: { id, ...patch, role: patch.role as Exclude<UserRole, "PLATFORM_ADMIN"> | undefined } }),
          invalidate,
        ),
      transitionStatus: (caseId, to, reason) =>
        call(apiTransition({ data: { caseId, to, reason } }), invalidate),
      assignCase: (caseId, toOrgId, _toUserId, reason) =>
        call(apiAssign({ data: { caseId, toOrgId, reason } }), invalidate),
      logContact: (caseId, note, result) =>
        call(apiLogContact({ data: { caseId, note, result } }), invalidate),
      logPromise: (caseId, promisedDate, amountUSD) =>
        call(apiLogPromise({ data: { caseId, promisedDate, amountUSD } }), invalidate),
      recordPayment: (caseId, amountUSD, kind) =>
        call(apiRecordPayment({ data: { caseId, amountUSD, kind } }), invalidate),
      generateDocument: (caseId, kind, title) =>
        call(apiGenerateDocument({ data: { caseId, kind, title } }), invalidate),
      addCost: (caseId, kind, amountUSD, note) =>
        call(apiAddCost({ data: { caseId, kind, amountUSD, note } }), invalidate),
      setEnforcementRoute: (caseId, route) => call(apiSetRoute({ data: { caseId, route } }), invalidate),
      initiateTransfer: (caseId, amountUSD) =>
        call(apiInitiateTransfer({ data: { caseId, amountUSD } }), invalidate),
      approveTransferAsManager: (transferId) =>
        call(apiApproveTransfer({ data: { transferId } }), invalidate),
      approveTransferAsAccountant: (transferId) =>
        call(apiApproveTransfer({ data: { transferId } }), invalidate),
      writeOff: (caseId, reason) => call(apiWriteOff({ data: { caseId, reason } }), invalidate),
      createCasesFromRows: async (rows) => {
        const r = await apiCreateCases({ data: { rows } });
        await invalidate();
        return r.created ?? 0;
      },
      startVisit: (caseId, lat, lng) => call(apiStartVisit({ data: { caseId, lat, lng } }), invalidate),
      completeVisit: (visitId, result, note) =>
        call(apiCompleteVisit({ data: { visitId, result, note } }), invalidate),
    }),
    [db, currentUser, authenticated, demoMode, invalidate, scopedCases, caseById, eventsFor, scopedVisits, canManageUsers, manageableUsers],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Загрузка DebtFlow…
      </div>
    );
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
