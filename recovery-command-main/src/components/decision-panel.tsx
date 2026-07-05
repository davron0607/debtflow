import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Check } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { caseReco, suggestAgencies } from "@/lib/decision-engine";
import { fmtUSD } from "@/lib/format";
import type { Case } from "@/lib/store/types";

// Панель рекомендации Decision Engine на странице дела.
// Человек подтверждает — система исполняет и пишет аудит.
export function DecisionPanel({ c }: { c: Case }) {
  const store = useStore();
  const { db, currentUser } = store;
  const navigate = useNavigate();
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState("");

  const r = caseReco(db, c);
  if (!r) return null;
  const canApprove = r.approverRoles.includes(currentUser.role);

  const approve = (why?: string) => {
    if (r.action === "ASSIGN") {
      const best = suggestAgencies(db, c)[0];
      if (best) store.assignCase(c.id, best.org.id, undefined, `Decision Engine: ${best.reasons.join("; ")}`);
      return;
    }
    if (r.action === "CALL" || r.action === "FOLLOW_UP_PROMISE") return; // действия ниже на странице
    if (r.action === "VISIT") {
      navigate({ to: "/field" });
      return;
    }
    if (r.needsReason && !why) {
      setAskReason(true);
      return;
    }
    if (r.action === "WRITE_OFF") {
      store.writeOff(c.id, why ?? "Decision Engine: нерентабельно");
      return;
    }
    if (r.route) store.setEnforcementRoute(c.id, r.route);
    if (r.targetStatus) store.transitionStatus(c.id, r.targetStatus, `Decision Engine: ${r.reasons[0] ?? ""}`);
  };

  const riskCls = r.risk === "LOW" ? "text-success" : r.risk === "MEDIUM" ? "text-money" : "text-destructive";
  const executable = !["CALL", "FOLLOW_UP_PROMISE"].includes(r.action);

  return (
    <div className="mt-5 rounded-md border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Рекомендация Decision Engine
          </div>
          <div className="mt-1 font-display text-lg font-bold">{r.label}</div>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {r.reasons.map((x, i) => (
              <li key={i}>✓ {x}</li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="grid grid-cols-3 gap-3 text-right">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">P(взыск)</div>
              <div className="font-mono text-sm font-semibold">{r.probability}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Риск</div>
              <div className={`font-mono text-sm font-semibold ${riskCls}`}>
                {r.risk === "LOW" ? "низкий" : r.risk === "MEDIUM" ? "средний" : "высокий"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Ожид. возврат</div>
              <div className="font-mono text-sm font-semibold text-money">{fmtUSD(r.expectedRecoveryUSD)}</div>
            </div>
          </div>
          {canApprove && executable && (
            <button
              onClick={() => approve()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" /> Утвердить · уверенность {r.confidence}%
            </button>
          )}
          {!canApprove && (
            <div className="text-[10px] text-muted-foreground">
              Утверждает: {r.approverRoles.join(", ")}
            </div>
          )}
        </div>
      </div>
      {askReason && (
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
              approve(reason);
              setAskReason(false);
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
}
