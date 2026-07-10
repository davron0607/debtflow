import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store/store";
import { fmtUSD } from "@/lib/format";
import { Calculator, TrendingDown, TrendingUp } from "lucide-react";
import { recoveryProbability, legalCosts } from "@/lib/decision-engine";

export const Route = createFileRoute("/_app/roi")({
  component: RoiPage,
});

function RoiPage() {
  const { db, transitionStatus, setEnforcementRoute, currentUser } = useStore();
  const [selected, setSelected] = useState<string>(db.cases[0]?.id ?? "");
  const [pOverride, setPOverride] = useState<number | null>(null);
  const [extraCostsInput, setExtraCostsInput] = useState("");
  const extraCostsUSD = extraCostsInput === "" ? 0 : Number(extraCostsInput);

  const c = db.cases.find((x) => x.id === selected);
  const pEngine = c ? recoveryProbability(db, c) : 0;
  const pRecovery = pOverride ?? pEngine;
  const existingCosts = c ? db.costs.filter((k) => k.caseId === c.id).reduce((s, k) => s + k.amountUSD, 0) : 0;
  const { court, notary } = c ? legalCosts(c) : { court: 0, notary: 0 };
  const disputed = c?.status === "DISPUTE";
  const expectedRecovery = c ? (c.amountUSD * pRecovery) / 100 : 0;
  const netCourt = expectedRecovery - existingCosts - extraCostsUSD - court;
  const netNotary = expectedRecovery - existingCosts - extraCostsUSD - notary;
  const best: "NOTARY" | "COURT" | "RESTRUCTURE" =
    Math.max(netCourt, netNotary) <= 0 ? "RESTRUCTURE" : disputed ? "COURT" : "NOTARY";
  const netBest = best === "COURT" ? netCourt : best === "NOTARY" ? netNotary : Math.max(netCourt, netNotary);
  const confidence = Math.min(95, Math.round(60 + Math.abs(netBest) / Math.max(1, expectedRecovery) * 60));
  const totalCosts = existingCosts + extraCostsUSD + (best === "COURT" ? court : notary);
  const netExpected = expectedRecovery - totalCosts;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Центр решений · Legal ROI</h1>
        <p className="text-sm text-muted-foreground">
          Суд vs нотариус vs реструктуризация — по деньгам, а не по привычке. Вероятность считает Decision Engine.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold uppercase">Параметры</h2>
          </div>
          <label className="mb-1 block text-xs text-muted-foreground">Дело</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mb-3 w-full rounded border border-input bg-background p-2 text-sm">
            {db.cases
              .filter((c) => c.amountUSD > 5000 && !["CLOSED", "PAID", "WRITTEN_OFF"].includes(c.status))
              .map((c) => {
                const d = db.debtors.find((x) => x.id === c.debtorId);
                return <option key={c.id} value={c.id}>{c.code} · {d?.name} · {fmtUSD(c.amountUSD)}</option>;
              })}
          </select>

          <label className="mb-1 block text-xs text-muted-foreground">
            Вероятность взыскания: {pRecovery}%{" "}
            {pOverride === null ? (
              <span className="text-primary">(Decision Engine)</span>
            ) : (
              <button onClick={() => setPOverride(null)} className="text-primary underline">
                вернуть расчёт ({pEngine}%)
              </button>
            )}
          </label>
          <input type="range" min={0} max={100} value={pRecovery} onChange={(e) => setPOverride(Number(e.target.value))} className="mb-4 w-full" />

          <label className="mb-1 block text-xs text-muted-foreground">Дополнительные расходы (USD)</label>
          <input type="number" value={extraCostsInput} onChange={(e) => setExtraCostsInput(e.target.value.replace(/^0+(?=\d)/, ""))}
            className="w-full rounded border border-input bg-background p-2 text-sm" />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className={`rounded border p-3 ${best === "COURT" ? "border-primary bg-primary/5" : "border-border bg-surface-2"}`}>
              <div className="text-[10px] uppercase text-muted-foreground">Суд (E-SUD)</div>
              <div className="mt-1 font-mono text-sm">издержки {fmtUSD(court)}</div>
              <div className={`font-mono text-sm ${netCourt > 0 ? "text-success" : "text-destructive"}`}>чистый {fmtUSD(netCourt)}</div>
              <div className="text-[10px] text-muted-foreground">~3–6 месяцев</div>
            </div>
            <div className={`rounded border p-3 ${best === "NOTARY" ? "border-primary bg-primary/5" : "border-border bg-surface-2"}`}>
              <div className="text-[10px] uppercase text-muted-foreground">Нотариус (исп. надпись)</div>
              <div className="mt-1 font-mono text-sm">издержки {fmtUSD(notary)}</div>
              <div className={`font-mono text-sm ${netNotary > 0 ? "text-success" : "text-destructive"}`}>чистый {fmtUSD(netNotary)}</div>
              <div className="text-[10px] text-muted-foreground">~3 недели{disputed ? " · недоступно: спор" : ""}</div>
            </div>
          </div>

          <div className="mt-3 rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
            V2 (roadmap): вероятность из предиктивной модели на исторических событиях, которые собираются уже сейчас.
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase text-muted-foreground">Результат</h2>
          <div className="grid grid-cols-2 gap-3">
            <Cell label="Сумма долга" value={fmtUSD(c?.amountUSD ?? 0)} tone="money" />
            <Cell label="Ожидаемое взыскание" value={fmtUSD(expectedRecovery)} tone="success" />
            <Cell label="Существующие расходы" value={fmtUSD(existingCosts)} />
            <Cell label="Дополнительные" value={fmtUSD(extraCostsUSD)} />
            <Cell label="Всего cost-to-recover" value={fmtUSD(totalCosts)} tone="destructive" />
            <Cell label="Чистый ожидаемый" value={fmtUSD(netExpected)} tone={netExpected > 0 ? "success" : "destructive"} />
          </div>

          <div className={`mt-5 flex items-center gap-3 rounded-md border p-4 ${
            netExpected > 0 ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"
          }`}>
            {netExpected > 0 ? <TrendingUp className="h-6 w-6 text-success" /> : <TrendingDown className="h-6 w-6 text-destructive" />}
            <div>
              <div className="font-display text-sm font-semibold">Рекомендация · уверенность {confidence}%</div>
              <div className={netExpected > 0 ? "text-success" : "text-destructive"}>
                {best === "NOTARY" ? "НОТАРИУС — дешевле, быстрее, выше ROI" : best === "COURT" ? "СУД — долг оспаривается, нотариус недоступен" : "Реструктуризация или списание — принуждение убыточно"}
              </div>
            </div>
          </div>

          {c && best !== "RESTRUCTURE" && (currentUser.role === "BANK_ADMIN" || currentUser.role === "BANK_LEGAL") && (
            <button
              onClick={() => setEnforcementRoute(c.id, best)}
              className="mt-3 w-full rounded bg-primary py-2 text-sm text-primary-foreground"
            >
              Утвердить маршрут: {best === "NOTARY" ? "нотариус" : "суд"}
            </button>
          )}
          {c && best === "RESTRUCTURE" && (currentUser.role === "BANK_ADMIN" || currentUser.role === "BANK_LEGAL") && (
            <button
              onClick={() => transitionStatus(c.id, "RESTRUCTURING_PROPOSED", "Decision Engine: принуждение убыточно")}
              className="mt-3 w-full rounded bg-primary py-2 text-sm text-primary-foreground"
            >
              Зафиксировать: «Реструктуризация предложена»
            </button>
          )}
          {c && (
            <Link to="/cases/$id" params={{ id: c.id }} className="mt-2 block text-center text-xs text-primary hover:underline">
              Открыть дело →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, tone = "default" }: { label: string; value: string; tone?: "money" | "success" | "destructive" | "default" }) {
  const cls =
    tone === "money" ? "text-money"
    : tone === "success" ? "text-success"
    : tone === "destructive" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded border border-border bg-surface-2 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-lg ${cls}`}>{value}</div>
    </div>
  );
}
