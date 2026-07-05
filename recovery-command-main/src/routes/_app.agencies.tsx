import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useStore } from "@/lib/store/store";
import { fmtUSD } from "@/lib/format";

export const Route = createFileRoute("/_app/agencies")({
  component: AgenciesPage,
});

function AgenciesPage() {
  const { db } = useStore();

  const rows = useMemo(() => {
    return db.orgs
      .filter((o) => o.type === "COLLECTOR" || o.type === "LEGAL_FIRM")
      .map((org) => {
        const cs = db.cases.filter((c) => c.assignedOrgId === org.id);
        const totalUSD = cs.reduce((s, c) => s + c.amountUSD, 0);
        const paid = db.payments
          .filter((p) => p.paidAt && cs.find((c) => c.id === p.caseId))
          .reduce((s, p) => s + p.amountUSD, 0);
        const recoveryRate = totalUSD > 0 ? (paid / totalUSD) * 100 : 0;
        const slaTotal = db.slas.filter((s) => cs.find((c) => c.id === s.caseId)).length;
        const slaBreached = db.slas.filter((s) => s.breached && cs.find((c) => c.id === s.caseId)).length;
        const slaScore = slaTotal > 0 ? ((slaTotal - slaBreached) / slaTotal) * 100 : 100;
        const contactEvents = db.events.filter((e) => e.type === "CONTACT_LOGGED" && cs.find((c) => c.id === e.caseId)).length;
        const contactDiscipline = cs.length > 0 ? (contactEvents / cs.length) * 100 : 0;
        const disputes = cs.filter((c) => c.status === "DISPUTE").length;
        return { org, count: cs.length, totalUSD, paid, recoveryRate, slaScore, contactDiscipline, disputes };
      })
      .sort((a, b) => b.recoveryRate - a.recoveryRate);
  }, [db]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Аналитика агентств</h1>
        <p className="text-sm text-muted-foreground">
          Четыре измерения: возврат, дисциплина SLA, дисциплина контактов, доля споров.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <div key={r.org.id} className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <div className="text-xs uppercase text-muted-foreground">{r.org.type}</div>
                <h2 className="font-display text-lg font-semibold">{r.org.name}</h2>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-bold text-primary">{r.recoveryRate.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">возврат</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Metric label="Дел" value={String(r.count)} />
              <Metric label="Портфель" value={fmtUSD(r.totalUSD)} />
              <Metric label="Взыскано" value={fmtUSD(r.paid)} tone="success" />
              <Metric label="Дисциплина SLA" value={`${r.slaScore.toFixed(0)}%`} tone={r.slaScore >= 80 ? "success" : "destructive"} />
              <Metric label="Дисциплина контактов" value={`${r.contactDiscipline.toFixed(0)}%`} />
              <Metric label="Споры" value={String(r.disputes)} tone={r.disputes > 2 ? "destructive" : "default"} />
            </div>
            <div className="mt-4 space-y-1.5">
              <Bar label="Возврат" pct={r.recoveryRate} tone="bg-primary" />
              <Bar label="SLA" pct={r.slaScore} tone="bg-success" />
              <Bar label="Контакты" pct={Math.min(100, r.contactDiscipline)} tone="bg-money" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "destructive" }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded border border-border bg-surface-2 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm ${cls}`}>{value}</div>
    </div>
  );
}

function Bar({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span><span className="font-mono">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
