import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore } from "@/lib/store/store";
import { fmtUSD } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_app/my-cases")({
  component: MyCases,
});

function MyCases() {
  const { db, scopedCases, currentUser } = useStore();
  const cases = scopedCases();

  const prioritized = useMemo(() => {
    return [...cases].sort((a, b) => {
      // problem statuses first, then higher DPD, then higher amount
      const rank = (s: string) => (["PROMISE_BROKEN", "NO_CONTACT", "DISPUTE"].includes(s) ? 0 : 1);
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (b.dpd !== a.dpd) return b.dpd - a.dpd;
      return b.amountUSD - a.amountUSD;
    });
  }, [cases]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Рабочее место · {currentUser.name}
        </div>
        <h1 className="font-display text-3xl font-bold">Мои дела</h1>
        <p className="text-sm text-muted-foreground">
          Приоритизировано по DPD и проблемным статусам. Виден только периметр вашей организации.
        </p>
      </div>

      <div className="grid gap-3">
        {prioritized.map((c) => {
          const d = db.debtors.find((x) => x.id === c.debtorId);
          return (
            <Link
              key={c.id}
              to="/cases/$id"
              params={{ id: c.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-primary">{c.code}</span>
                  <StatusBadge status={c.status} />
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
        {prioritized.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Дел пока не назначено.
          </div>
        )}
      </div>
    </div>
  );
}
