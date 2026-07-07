import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Inbox, Check, ArrowUpRight } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { caseReco, suggestAgencies, type CaseReco } from "@/lib/decision-engine";
import { fmtUSD, fmtDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import type { Case, CaseStatus } from "@/lib/store/types";
import { STATUS_LABEL } from "@/lib/state-machine";

export const Route = createFileRoute("/_app/queue")({
  component: QueuePage,
});

function QueuePage() {
  const store = useStore();
  const { db, currentUser, scopedCases, takeCase } = store;
  const isWorker = ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "LEGAL_FIRM"].includes(currentUser.role);
  const navigate = useNavigate();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "ALL">("ALL");

  const items = useMemo(() => {
    const rows = scopedCases()
      // Коллектор видит рекомендации только по своим делам
      .filter((c) => !isWorker || c.assignedUserId === currentUser.id)
      .map((c) => ({ c, r: caseReco(db, c) }))
      .filter((x): x is { c: Case; r: CaseReco } => !!x.r && x.r.approverRoles.includes(currentUser.role))
      .sort((a, b) => b.r.expectedRecoveryUSD * (b.r.confidence / 100) - a.r.expectedRecoveryUSD * (a.r.confidence / 100));
    return rows;
  }, [db, scopedCases, currentUser.role, currentUser.id, isWorker]);

  const transfers = db.transfers.filter(
    (t) =>
      (currentUser.role === "MANAGER" && t.status === "INITIATED") ||
      (currentUser.role === "ACCOUNTANT" && t.status === "MANAGER_APPROVED"),
  );

  const promisesDue = useMemo(
    () =>
      db.payments
        .filter((p) => {
          if (p.kind !== "PROMISE" || !p.promisedDate || p.paidAt) return false;
          // только по открытым делам, где обещание ещё актуально
          const c = scopedCases().find((x) => x.id === p.caseId);
          if (!c || !["PROMISE_TO_PAY", "PARTIALLY_PAID"].includes(c.status)) return false;
          return new Date(p.promisedDate).getTime() - Date.now() < 2 * 86400000;
        })
        .sort((a, b) => (a.promisedDate! < b.promisedDate! ? -1 : 1)),
    [db.payments, scopedCases],
  );

  const approve = (c: Case, r: CaseReco, why?: string) => {
    if (r.action === "ASSIGN") {
      const best = suggestAgencies(db, c)[0];
      if (best) store.assignCase(c.id, best.org.id, undefined, `Decision Engine: ${best.reasons.join("; ")}`);
      return;
    }
    if (r.action === "CALL" || r.action === "VISIT" || r.action === "FOLLOW_UP_PROMISE") {
      navigate({ to: currentUser.role === "COLLECTOR" && r.action === "VISIT" ? "/field" : "/cases/$id", params: { id: c.id } });
      return;
    }
    if (r.needsReason && !why) {
      setReasonFor(c.id);
      return;
    }
    if (r.action === "WRITE_OFF") {
      store.writeOff(c.id, why ?? "Decision Engine: нерентабельно");
      return;
    }
    if (r.route) store.setEnforcementRoute(c.id, r.route);
    if (r.targetStatus) store.transitionStatus(c.id, r.targetStatus, `Decision Engine: ${r.reasons[0] ?? ""}`);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Очередь задач</h1>
        <p className="text-sm text-muted-foreground">
          Моя работа на сегодня — отсортирована по финансовому эффекту. Роль: {currentUser.name}.
        </p>
      </div>

      {transfers.length > 0 && (
        <div className="mb-4 rounded-lg border border-money/40 bg-money/10 p-4">
          <div className="text-sm font-medium">
            {transfers.length} перевод(а) ждут вашего подтверждения ·{" "}
            {fmtUSD(transfers.reduce((s, t) => s + t.amountUSD, 0))}
          </div>
          <Link to="/transfers" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Перейти к переводам <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {promisesDue.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Обещания оплаты: просроченные и ближайшие 2 дня
          </div>
          <div className="flex flex-wrap gap-2">
            {promisesDue.map((p) => {
              const c = db.cases.find((x) => x.id === p.caseId);
              if (!c) return null;
              const d = db.debtors.find((x) => x.id === c.debtorId);
              const overdueDays = Math.floor((Date.now() - new Date(p.promisedDate!).getTime()) / 86400000);
              const overdue = overdueDays > 0;
              return (
                <Link
                  key={p.id}
                  to="/cases/$id"
                  params={{ id: c.id }}
                  title={`${d?.name}: должник обещал внести ${fmtUSD(p.amountUSD)} до ${fmtDate(p.promisedDate!)}`}
                  className={
                    "rounded-md border px-2 py-1 text-xs " +
                    (overdue
                      ? "border-destructive/40 bg-destructive/10 hover:border-destructive"
                      : "border-border bg-surface-2 hover:border-primary")
                  }
                >
                  <span className="font-mono text-primary">{c.code}</span> · {d?.name} · обещал{" "}
                  {fmtUSD(p.amountUSD)}{" "}
                  {overdue ? (
                    <span className="font-medium text-destructive">просрочено {overdueDays} дн (до {fmtDate(p.promisedDate!)})</span>
                  ) : (
                    <>до {fmtDate(p.promisedDate!)}</>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Пул организации: нераспределённые дела — можно взять себе */}
      {isWorker && (() => {
        const pool = scopedCases().filter(
          (c) => !c.assignedUserId && !["PAID", "CLOSED", "WRITTEN_OFF", "RESTRUCTURED"].includes(c.status),
        );
        if (pool.length === 0) return null;
        return (
          <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">
              📥 Пул организации · {pool.length} нераспределённых дел
            </div>
            <div className="space-y-2">
              {pool.slice(0, 8).map((c) => {
                const d = db.debtors.find((x) => x.id === c.debtorId);
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
                    <div className="min-w-0">
                      <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-xs text-primary hover:underline">
                        {c.code}
                      </Link>
                      <span className="ml-2 text-sm font-medium">{d?.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">DPD {c.dpd} · {fmtUSD(c.amountUSD)}</span>
                    </div>
                    <button
                      onClick={async () => {
                        const r = await takeCase(c.id);
                        if (!r.ok && r.error) alert(r.error);
                      }}
                      className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Взять в работу
                    </button>
                  </div>
                );
              })}
              {pool.length > 8 && (
                <div className="text-xs text-muted-foreground">…и ещё {pool.length - 8} в пуле</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Фильтр и сводка по статусам */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (statusFilter === "ALL" ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:border-primary/40")
            }
          >
            Все · {items.length}
          </button>
          {[...new Map(items.map((x) => [x.c.status, items.filter((y) => y.c.status === x.c.status).length])).entries()].map(
            ([s, n]) => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}
                className={
                  "rounded-full border px-3 py-1 text-xs " +
                  (statusFilter === s ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:border-primary/40")
                }
              >
                {STATUS_LABEL[s]} · {n}
              </button>
            ),
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.filter(({ c }) => statusFilter === "ALL" || c.status === statusFilter).map(({ c, r }) => {
          const d = db.debtors.find((x) => x.id === c.debtorId);
          return (
            <div key={c.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-xs text-primary hover:underline">
                      {c.code}
                    </Link>
                    <span className="text-sm font-medium">{d?.name}</span>
                    <StatusBadge status={c.status} />
                    <RiskChip risk={r.risk} probability={r.probability} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.reasons.join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Долг</div>
                    <div className="font-mono text-sm">{fmtUSD(c.amountUSD)}</div>
                  </div>
                  <div
                    className="text-right"
                    title={`Ожидаемый возврат = долг ${fmtUSD(c.amountUSD)} × P(взыскания) ${r.probability}%`}
                  >
                    <div className="text-[10px] uppercase text-muted-foreground">Ожид. возврат</div>
                    <div className="font-mono text-sm text-money">≈ {fmtUSD(r.expectedRecoveryUSD)}</div>
                    <div className="text-[10px] text-muted-foreground">уверенность {r.confidence}%</div>
                  </div>
                  <button
                    onClick={() => approve(c, r)}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" /> {r.label}
                  </button>
                </div>
              </div>

              {reasonFor === c.id && (
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Обоснование (обязательно, попадёт в аудит)"
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  />
                  <button
                    disabled={!reason.trim()}
                    onClick={() => {
                      approve(c, r, reason);
                      setReasonFor(null);
                      setReason("");
                    }}
                    className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-40"
                  >
                    Подтвердить
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8" />
            Очередь пуста — для вашей роли решений сейчас нет.
          </div>
        )}
      </div>
    </div>
  );
}

export function RiskChip({ risk, probability }: { risk: "LOW" | "MEDIUM" | "HIGH"; probability: number }) {
  const cls =
    risk === "LOW"
      ? "bg-success/10 text-success"
      : risk === "MEDIUM"
      ? "bg-money/10 text-money"
      : "bg-destructive/10 text-destructive";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      P(взыск) {probability}% · риск {risk === "LOW" ? "низкий" : risk === "MEDIUM" ? "средний" : "высокий"}
    </span>
  );
}
