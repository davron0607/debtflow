import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD, dpdBucket } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import type { CaseStatus } from "@/lib/store/types";

export const Route = createFileRoute("/_app/cases")({
  component: CasesList,
});

function CasesList() {
  const { db, scopedCases, currentUser, assignCase } = useStore();
  const cases = scopedCases();

  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState<string>("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [orgF, setOrgF] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOrg, setBulkOrg] = useState<string>("");

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (bucket !== "all" && dpdBucket(c.dpd) !== bucket) return false;
      if (statusF !== "all" && c.status !== statusF) return false;
      if (orgF !== "all") {
        if (orgF === "none" && c.assignedOrgId) return false;
        if (orgF !== "none" && c.assignedOrgId !== orgF) return false;
      }
      if (q) {
        const d = db.debtors.find((x) => x.id === c.debtorId);
        const hay = `${c.code} ${d?.name ?? ""} ${d?.pinfl ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [cases, bucket, statusF, orgF, q, db.debtors]);

  const canBulkAssign = currentUser.role === "BANK_ADMIN";

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const doBulk = () => {
    if (!bulkOrg || selected.size === 0) return;
    selected.forEach((id) => assignCase(id, bulkOrg, undefined, "Массовое переназначение"));
    setSelected(new Set());
    setBulkOrg("");
  };

  const orgs = db.orgs.filter((o) => o.type === "COLLECTOR" || o.type === "LEGAL_FIRM");
  const allStatuses: CaseStatus[] = [
    "NEW", "ASSIGNED", "SOFT_COLLECTION", "CONTACTED", "NO_CONTACT",
    "PROMISE_TO_PAY", "PROMISE_BROKEN", "PARTIALLY_PAID", "PAID",
    "DISPUTE", "RESTRUCTURING_PROPOSED", "RESTRUCTURED",
    "ESCALATED_TO_LEGAL", "PRE_CLAIM_SENT", "COURT_PACKAGE_READY",
    "FILED_TO_COURT", "COURT_DECISION_RECEIVED", "READY_FOR_MIB",
    "CLOSED", "WRITTEN_OFF",
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Все дела</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} из {cases.length} · с учётом ролевого доступа
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск: ПИНФЛ, ФИО, код дела"
          className="min-w-[240px] flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
        <select value={bucket} onChange={(e) => setBucket(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="all">Все DPD</option>
          <option value="1-30">1–30</option>
          <option value="31-60">31–60</option>
          <option value="61-90">61–90</option>
          <option value="90+">90+</option>
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="all">Все статусы</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={orgF} onChange={(e) => setOrgF(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="all">Все агентства</option>
          <option value="none">Не назначено</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {canBulkAssign && selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm">
          <span>Выбрано: <b>{selected.size}</b></span>
          <select value={bulkOrg} onChange={(e) => setBulkOrg(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-sm">
            <option value="">Куда назначить…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button
            onClick={doBulk}
            disabled={!bulkOrg}
            className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-40"
          >
            Массово назначить
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              {canBulkAssign && <th className="w-8 p-2"></th>}
              <th className="p-2 text-left">Код</th>
              <th className="p-2 text-left">Должник</th>
              <th className="p-2 text-left">ПИНФЛ</th>
              <th className="p-2 text-right">Сумма (USD)</th>
              <th className="p-2 text-right">DPD</th>
              <th className="p-2 text-center">Залог</th>
              <th className="p-2 text-left">Статус</th>
              <th className="p-2 text-left">Агентство</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const d = db.debtors.find((x) => x.id === c.debtorId);
              const org = db.orgs.find((o) => o.id === c.assignedOrgId);
              return (
                <tr key={c.id} className="border-t border-border/50 hover:bg-surface-2">
                  {canBulkAssign && (
                    <td className="p-2">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                  )}
                  <td className="p-2">
                    <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-primary hover:underline">
                      {c.code}
                    </Link>
                  </td>
                  <td className="p-2">{d?.name}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{d?.pinfl}</td>
                  <td className="p-2 text-right font-mono text-money">{fmtUSD(c.amountUSD)}</td>
                  <td className="p-2 text-right font-mono">{c.dpd}</td>
                  <td className="p-2 text-center text-xs">
                    {c.collateral ? <span className="rounded bg-money/20 px-1.5 py-0.5 text-money">SEC</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2"><StatusBadge status={c.status} /></td>
                  <td className="p-2 text-xs text-muted-foreground">{org?.name ?? "—"}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                  Ничего не найдено под фильтры.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
