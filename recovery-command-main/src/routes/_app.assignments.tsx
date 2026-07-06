import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Users } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { suggestAgencies } from "@/lib/decision-engine";

export const Route = createFileRoute("/_app/assignments")({
  component: AssignmentsPage,
});

function AssignmentsPage() {
  const { db, scopedCases, assignCase, currentUser } = useStore();
  const cases = scopedCases();
  const [reason, setReason] = useState("");
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [targetOrg, setTargetOrg] = useState<string>("");

  if (currentUser.role !== "BANK_ADMIN") {
    return <div className="p-8 text-sm text-muted-foreground">Доступно только Администратору банка.</div>;
  }

  const collectors = [
    // Собственная служба взыскания банка (in-house) — первой в списке
    ...db.orgs.filter((o) => o.id === currentUser.orgId),
    ...db.orgs.filter((o) => o.type === "COLLECTOR" || o.type === "LEGAL_FIRM"),
  ];
  const unassigned = cases.filter((c) => !c.assignedOrgId);
  const active = cases.filter((c) => c.assignedOrgId && !["CLOSED", "WRITTEN_OFF", "PAID"].includes(c.status));

  const confirm = () => {
    if (!selectedCase || !targetOrg || !reason.trim()) return;
    assignCase(selectedCase, targetOrg, undefined, reason);
    setSelectedCase(null);
    setTargetOrg("");
    setReason("");
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Назначения · Маркетплейс</h1>
        <p className="text-sm text-muted-foreground">
          Ново-загруженные дела и переназначение активных с обязательным обоснованием.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Не назначено · {unassigned.length}
          </h2>
          <div className="space-y-2">
            {unassigned.map((c) => {
              const d = db.debtors.find((x) => x.id === c.debtorId);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
                  <div>
                    <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-xs text-primary">{c.code}</Link>
                    <div className="text-sm">{d?.name}</div>
                    <div className="text-xs text-muted-foreground">DPD {c.dpd} · {fmtUSD(c.amountUSD)}</div>
                  </div>
                  <button onClick={() => setSelectedCase(c.id)} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
                    <Users className="mr-1 inline h-3 w-3" /> Назначить
                  </button>
                </div>
              );
            })}
            {unassigned.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Все дела распределены.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Активные (можно переназначить)
          </h2>
          <div className="max-h-[600px] space-y-2 overflow-y-auto">
            {active.map((c) => {
              const d = db.debtors.find((x) => x.id === c.debtorId);
              const org = db.orgs.find((o) => o.id === c.assignedOrgId);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3">
                  <div className="min-w-0">
                    <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-xs text-primary">{c.code}</Link>
                    <div className="truncate text-sm">{d?.name}</div>
                    <div className="text-xs text-muted-foreground">{org?.name} · <StatusBadge status={c.status} /></div>
                  </div>
                  <button onClick={() => setSelectedCase(c.id)} className="rounded border border-border px-2 py-1 text-xs">
                    <ArrowRight className="mr-1 inline h-3 w-3" /> Переназначить
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
            <h3 className="mb-3 font-display text-lg font-semibold">Назначение</h3>

            {(() => {
              const c = db.cases.find((x) => x.id === selectedCase);
              if (!c) return null;
              const ranked = suggestAgencies(db, c);
              const best = ranked[0];
              return (
                <div className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Рекомендация Decision Engine
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-medium">{best.org.name}</span>
                    <span className="font-mono text-xs">{best.score}%</span>
                  </div>
                  <ul className="mt-1 text-[11px] text-muted-foreground">
                    {best.reasons.map((r, i) => (
                      <li key={i}>✓ {r}</li>
                    ))}
                  </ul>
                  <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                    {ranked.slice(1).map((a) => (
                      <div key={a.org.id} className="flex justify-between">
                        <span>{a.org.name}</span>
                        <span className="font-mono">{a.score}%</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setTargetOrg(best.org.id);
                      if (!reason.trim()) setReason(`Decision Engine: ${best.reasons.join("; ")}`);
                    }}
                    className="mt-2 w-full rounded-md border border-primary/50 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    Принять рекомендацию
                  </button>
                </div>
              );
            })()}

            <label className="mb-1 block text-xs text-muted-foreground">Кому</label>
            <select value={targetOrg} onChange={(e) => setTargetOrg(e.target.value)} className="mb-3 w-full rounded border border-input bg-background p-2 text-sm">
              <option value="">Выберите организацию…</option>
              {collectors.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <label className="mb-1 block text-xs text-muted-foreground">Обоснование (в аудит)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mb-3 h-20 w-full rounded border border-input bg-background p-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setSelectedCase(null); setReason(""); setTargetOrg(""); }} className="rounded border border-border px-3 py-1.5 text-sm">Отмена</button>
              <button onClick={confirm} disabled={!targetOrg || !reason.trim()} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40">Подтвердить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
