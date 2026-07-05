import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store/store";
import { fmtUSD, fmtDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_app/court")({
  component: CourtPage,
});

const LANES: { key: string; label: string; statuses: string[] }[] = [
  { key: "prep", label: "Подготовка", statuses: ["ESCALATED_TO_LEGAL", "PRE_CLAIM_SENT", "COURT_PACKAGE_READY"] },
  { key: "filed", label: "Подано в суд", statuses: ["FILED_TO_COURT"] },
  { key: "decision", label: "Решение получено", statuses: ["COURT_DECISION_RECEIVED"] },
  { key: "mib", label: "Готово к МИБ", statuses: ["READY_FOR_MIB"] },
];

function CourtPage() {
  const { db, scopedCases } = useStore();
  const cases = scopedCases();

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Суд · ручное ведение</h1>
        <p className="text-sm text-muted-foreground">
          В V1 статусы суда обновляются вручную. В V2 — синхронизация с E-SUD через IntegrationAdapter.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {LANES.map((lane) => {
          const laneCases = cases.filter((c) => lane.statuses.includes(c.status));
          return (
            <div key={lane.key} className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider">{lane.label}</h2>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{laneCases.length}</span>
              </div>
              <div className="space-y-2">
                {laneCases.map((c) => {
                  const d = db.debtors.find((x) => x.id === c.debtorId);
                  return (
                    <Link
                      key={c.id}
                      to="/cases/$id"
                      params={{ id: c.id }}
                      className="block rounded-md border border-border bg-surface-2 p-3 hover:border-primary/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-primary">{c.code}</span>
                        <span className="font-mono text-xs text-money">{fmtUSD(c.amountUSD)}</span>
                      </div>
                      <div className="mt-1 truncate text-sm">{d?.name}</div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <StatusBadge status={c.status} />
                        <span>DPD {c.dpd}</span>
                      </div>
                    </Link>
                  );
                })}
                {laneCases.length === 0 && (
                  <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Пусто
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Ключевые SLA-таймеры суда
        </h2>
        <div className="grid gap-2 md:grid-cols-2">
          {db.slas.filter((s) => s.type === "COURT_HEARING").map((s) => {
            const c = db.cases.find((x) => x.id === s.caseId);
            if (!c) return null;
            return (
              <div key={s.id} className={`rounded-md border p-3 text-sm ${s.breached ? "border-destructive/40 bg-destructive/10" : "border-border bg-surface-2"}`}>
                <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-xs text-primary">{c.code}</Link>
                <div className="mt-1 flex justify-between text-xs">
                  <span>Заседание</span>
                  <span className={s.breached ? "text-destructive" : "text-success"}>{fmtDate(s.dueAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
