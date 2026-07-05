import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Clock,
  Coins,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD, dpdBucket } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/state-machine";
import { StatusBadge } from "@/components/status-badge";
import type { CaseStatus } from "@/lib/store/types";

export const Route = createFileRoute("/_app/control-tower")({
  component: ControlTower,
});

function ControlTower() {
  const { db, scopedCases, currentUser } = useStore();
  const cases = scopedCases();

  const totals = useMemo(() => {
    const totalUSD = cases.reduce((s, c) => s + c.amountUSD, 0);
    const paidUSD = db.payments
      .filter((p) => p.paidAt && cases.find((c) => c.id === p.caseId))
      .reduce((s, p) => s + p.amountUSD, 0);
    const openCount = cases.filter((c) => !["CLOSED", "WRITTEN_OFF", "PAID"].includes(c.status)).length;
    const breachedSla = db.slas.filter((s) => s.breached && cases.find((c) => c.id === s.caseId)).length;
    const costsUSD = db.costs
      .filter((c) => cases.find((cs) => cs.id === c.caseId))
      .reduce((s, c) => s + c.amountUSD, 0);
    return { totalUSD, paidUSD, openCount, breachedSla, costsUSD };
  }, [db, cases]);

  const buckets = useMemo(() => {
    const b: Record<string, { count: number; sum: number }> = {
      "1-30": { count: 0, sum: 0 },
      "31-60": { count: 0, sum: 0 },
      "61-90": { count: 0, sum: 0 },
      "90+": { count: 0, sum: 0 },
    };
    cases.forEach((c) => {
      const k = dpdBucket(c.dpd);
      b[k].count++;
      b[k].sum += c.amountUSD;
    });
    return b;
  }, [cases]);

  const statusFunnel = useMemo(() => {
    const order: CaseStatus[] = [
      "NEW", "ASSIGNED", "SOFT_COLLECTION", "PROMISE_TO_PAY",
      "ESCALATED_TO_LEGAL", "COURT_PACKAGE_READY", "FILED_TO_COURT",
      "COURT_DECISION_RECEIVED", "READY_FOR_MIB", "PAID", "CLOSED",
    ];
    return order.map((s) => ({
      status: s,
      count: cases.filter((c) => c.status === s).length,
    }));
  }, [cases]);

  const attention = useMemo(() => {
    const rows = cases
      .filter((c) => {
        if (["CLOSED", "PAID", "WRITTEN_OFF"].includes(c.status)) return false;
        if (c.status === "PROMISE_BROKEN" || c.status === "NO_CONTACT") return true;
        if (c.dpd > 60 && !["ESCALATED_TO_LEGAL", "PRE_CLAIM_SENT", "COURT_PACKAGE_READY", "FILED_TO_COURT"].includes(c.status))
          return true;
        if (db.slas.some((s) => s.caseId === c.id && s.breached)) return true;
        return false;
      })
      .sort((a, b) => b.amountUSD - a.amountUSD)
      .slice(0, 8);
    return rows;
  }, [cases, db.slas]);

  const leaderboard = useMemo(() => {
    return db.orgs
      .filter((o) => o.type === "COLLECTOR" || o.type === "LEGAL_FIRM")
      .map((org) => {
        const orgCases = cases.filter((c) => c.assignedOrgId === org.id);
        const recovered = db.payments
          .filter((p) => p.paidAt && orgCases.find((c) => c.id === p.caseId))
          .reduce((s, p) => s + p.amountUSD, 0);
        const total = orgCases.reduce((s, c) => s + c.amountUSD, 0);
        const rate = total > 0 ? (recovered / total) * 100 : 0;
        const slaBreached = db.slas.filter((s) => s.breached && orgCases.find((c) => c.id === s.caseId)).length;
        return { org, count: orgCases.length, recovered, total, rate, slaBreached };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [db, cases]);

  const recoveryRate = totals.totalUSD > 0 ? (totals.paidUSD / totals.totalUSD) * 100 : 0;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {currentUser.role === "BANK_ADMIN" ? "Администратор банка" : "Юрист банка"} · Tenge Bank
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">Командный пульт</h1>
          <p className="text-sm text-muted-foreground">
            Нейтральный слой координации между банком, коллекторами, юр. фирмами и МИБ.
          </p>
        </div>
        <Link
          to="/portfolio/upload"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Загрузить портфель <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={Banknote} label="Портфель (USD)" value={fmtUSD(totals.totalUSD)} tone="money" />
        <Kpi icon={TrendingUp} label="Возврат %" value={`${recoveryRate.toFixed(1)}%`} tone="primary" />
        <Kpi icon={Coins} label="Взыскано (USD)" value={fmtUSD(totals.paidUSD)} tone="success" />
        <Kpi icon={Gauge} label="Открытых дел" value={String(totals.openCount)} tone="default" />
        <Kpi icon={AlertTriangle} label="Нарушения SLA" value={String(totals.breachedSla)} tone="destructive" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* DPD buckets */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Дела по DPD
            </h2>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {Object.entries(buckets).map(([k, v]) => {
              const max = Math.max(...Object.values(buckets).map((x) => x.count));
              const pct = max > 0 ? (v.count / max) * 100 : 0;
              const tone = k === "90+" ? "bg-destructive" : k === "61-90" ? "bg-money" : "bg-primary";
              return (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono">{k} дн</span>
                    <span className="text-muted-foreground">
                      {v.count} · {fmtUSD(v.sum)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status funnel */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Воронка статусов
          </h2>
          <div className="space-y-1.5">
            {statusFunnel.map((s) => {
              const max = Math.max(...statusFunnel.map((x) => x.count), 1);
              const pct = (s.count / max) * 100;
              return (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span className="w-40 truncate text-muted-foreground">
                    {STATUS_LABEL[s.status]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Рейтинг агентств
          </h2>
          <div className="space-y-3">
            {leaderboard.map((row) => (
              <div key={row.org.id} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{row.org.name}</span>
                  <span className="font-mono text-sm text-primary">{row.rate.toFixed(1)}%</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{row.count} дел · {fmtUSD(row.total)}</span>
                  <span>SLA брешей: {row.slaBreached}</span>
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/agencies"
            className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Полная аналитика <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Attention queue */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Требует внимания
            </h2>
            <p className="text-xs text-muted-foreground">
              Обещания нарушены, SLA превышены, DPD &gt; 60 без юр. эскалации.
            </p>
          </div>
          <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
            {attention.length} дел
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="pb-2 text-left font-medium">Код</th>
                <th className="pb-2 text-left font-medium">Должник</th>
                <th className="pb-2 text-right font-medium">Сумма</th>
                <th className="pb-2 text-right font-medium">DPD</th>
                <th className="pb-2 text-left font-medium">Статус</th>
                <th className="pb-2 text-left font-medium">Агентство</th>
              </tr>
            </thead>
            <tbody>
              {attention.map((c) => {
                const debtor = db.debtors.find((d) => d.id === c.debtorId);
                const org = db.orgs.find((o) => o.id === c.assignedOrgId);
                return (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-surface-2">
                    <td className="py-2">
                      <Link
                        to="/cases/$id"
                        params={{ id: c.id }}
                        className="font-mono text-primary hover:underline"
                      >
                        {c.code}
                      </Link>
                    </td>
                    <td className="py-2">{debtor?.name}</td>
                    <td className="py-2 text-right font-mono text-money">{fmtUSD(c.amountUSD)}</td>
                    <td className="py-2 text-right font-mono">{c.dpd}</td>
                    <td className="py-2"><StatusBadge status={c.status} /></td>
                    <td className="py-2 text-xs text-muted-foreground">{org?.name ?? "—"}</td>
                  </tr>
                );
              })}
              {attention.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Всё под контролем.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        Совокупная стоимость взыскания (расходы): <span className="font-mono text-money">{fmtUSD(totals.costsUSD)}</span>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  tone: "money" | "primary" | "success" | "destructive" | "default";
}) {
  const cls =
    tone === "money"
      ? "text-money"
      : tone === "primary"
      ? "text-primary"
      : tone === "success"
      ? "text-success"
      : tone === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`font-display text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
