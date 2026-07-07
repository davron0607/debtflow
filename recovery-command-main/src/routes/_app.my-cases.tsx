import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD, fmtDate } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/state-machine";
import { StatusBadge } from "@/components/status-badge";
import type { CaseStatus } from "@/lib/store/types";

export const Route = createFileRoute("/_app/my-cases")({
  component: MyCases,
});

// Статусы, интересные бухгалтеру: подходит срок оплаты / оплата на подтверждении
const ACCOUNTANT_STATUSES: CaseStatus[] = ["PROMISE_TO_PAY", "PARTIALLY_PAID", "PAID"];

function MyCases() {
  const { db, scopedCases, currentUser } = useStore();
  const cases = scopedCases();
  const isAccountant = currentUser.role === "ACCOUNTANT";
  const isCollectorRole = ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "LEGAL_FIRM"].includes(currentUser.role);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "ALL" | "ACC" | "MINE">(
    isAccountant ? "ACC" : "ALL",
  );

  // Сводка: количество дел по каждому статусу (кликабельный фильтр)
  const counts = useMemo(() => {
    const m = new Map<CaseStatus, number>();
    cases.forEach((c) => m.set(c.status, (m.get(c.status) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cases]);

  const promiseDue = useMemo(() => {
    const m = new Map<string, string>();
    db.payments
      .filter((p) => p.kind === "PROMISE" && p.promisedDate && !p.paidAt)
      .forEach((p) => m.set(p.caseId, p.promisedDate!));
    return m;
  }, [db.payments]);

  const filtered = useMemo(() => {
    let list = cases;
    if (statusFilter === "ACC") list = cases.filter((c) => ACCOUNTANT_STATUSES.includes(c.status));
    else if (statusFilter === "MINE") list = cases.filter((c) => c.assignedUserId === currentUser.id);
    else if (statusFilter !== "ALL") list = cases.filter((c) => c.status === statusFilter);
    return [...list].sort((a, b) => {
      // 1) не взятые в работу — наверх; 2) проблемные; 3) DPD; 4) сумма
      const rank = (s: string) =>
        s === "ASSIGNED" ? 0 : ["PROMISE_BROKEN", "NO_CONTACT", "DISPUTE"].includes(s) ? 1 : 2;
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (b.dpd !== a.dpd) return b.dpd - a.dpd;
      return b.amountUSD - a.amountUSD;
    });
  }, [cases, statusFilter]);

  const notTaken = cases.filter((c) => c.status === "ASSIGNED").length;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Рабочее место · {currentUser.name}
        </div>
        <h1 className="font-display text-3xl font-bold">Мои дела</h1>
        <p className="text-sm text-muted-foreground">
          {isAccountant
            ? "По умолчанию — дела со сроками оплаты и оплаты на подтверждении."
            : "Приоритизировано: сначала не взятые в работу, затем проблемные и высокий DPD."}
        </p>
      </div>

      {notTaken > 0 && !isAccountant && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-money/50 bg-money/10 px-3 py-2 text-sm">
          <BellRing className="h-4 w-4 text-money" />
          <span>
            <b>{notTaken}</b> новых дел ещё не взяты в работу — начните софт-взыскание, чтобы не терять время.
          </span>
        </div>
      )}

      {/* Сводка по статусам + фильтр */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <Chip active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>
          Все · {cases.length}
        </Chip>
        {isCollectorRole && (
          <Chip active={statusFilter === "MINE"} onClick={() => setStatusFilter(statusFilter === "MINE" ? "ALL" : "MINE")}>
            👤 Назначенные мне · {cases.filter((c) => c.assignedUserId === currentUser.id).length}
          </Chip>
        )}
        {isAccountant && (
          <Chip active={statusFilter === "ACC"} onClick={() => setStatusFilter("ACC")}>
            💰 К оплате/подтверждению · {cases.filter((c) => ACCOUNTANT_STATUSES.includes(c.status)).length}
          </Chip>
        )}
        {counts.map(([s, n]) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}>
            {STATUS_LABEL[s]} · {n}
          </Chip>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.map((c) => {
          const d = db.debtors.find((x) => x.id === c.debtorId);
          const isNew = c.status === "ASSIGNED";
          const due = promiseDue.get(c.id);
          const overdue = due ? new Date(due) < new Date() : false;
          return (
            <Link
              key={c.id}
              to="/cases/$id"
              params={{ id: c.id }}
              className={
                "flex items-center justify-between rounded-lg border bg-surface p-4 transition-colors hover:bg-surface-2 " +
                (isNew ? "border-money ring-1 ring-money/40" : "border-border hover:border-primary/40")
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-primary">{c.code}</span>
                  <StatusBadge status={c.status} />
                  {isNew && (
                    <span className="flex items-center gap-1 rounded-full bg-money/15 px-2 py-0.5 text-[10px] font-semibold text-money">
                      <BellRing className="h-3 w-3" /> НЕ ВЗЯТО В РАБОТУ
                    </span>
                  )}
                  {c.assignedUserId && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                      👤 {db.users.find((x) => x.id === c.assignedUserId)?.name ?? "—"}
                    </span>
                  )}
                  {due && ["PROMISE_TO_PAY", "PARTIALLY_PAID"].includes(c.status) && (
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (overdue ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")
                      }
                    >
                      {overdue ? `оплата просрочена (${fmtDate(due)})` : `оплата до ${fmtDate(due)}`}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate font-medium">{d?.name}</div>
                <div className="text-xs text-muted-foreground">ПИНФЛ {d?.pinfl} · тел. {d?.phone}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-money">{fmtUSD(c.amountUSD)}</div>
                <div className="text-xs text-muted-foreground">DPD {c.dpd} · {c.collateral ? "SECURED" : "UNSECURED"}</div>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {cases.length === 0 ? "Дел пока не назначено." : "Нет дел с выбранным статусом."}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs transition-colors " +
        (active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-surface text-muted-foreground hover:border-primary/40")
      }
    >
      {children}
    </button>
  );
}
