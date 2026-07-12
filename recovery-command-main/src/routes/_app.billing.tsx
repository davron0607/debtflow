import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Receipt, Send, Check, AlertTriangle, RefreshCw, Percent } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD, fmtDateTime } from "@/lib/format";
import {
  apiBillingOverview,
  apiSetCommission,
  apiGenerateInvoice,
  apiIssueInvoice,
  apiResolveInvoice,
} from "@/lib/api";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type Overview = Awaited<ReturnType<typeof apiBillingOverview>>;
type Invoice = Overview["invoices"][number];

const MONTH_LABEL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Сформирован",
  ISSUED: "Выставлен",
  PAID: "Оплачен",
  DISPUTED: "Оспорен",
};

const STATUS_CLS: Record<string, string> = {
  DRAFT: "bg-surface-2 text-muted-foreground",
  ISSUED: "bg-money/10 text-money",
  PAID: "bg-success/10 text-success",
  DISPUTED: "bg-destructive/10 text-destructive",
};

function BillingPage() {
  const { currentUser } = useStore();
  const [data, setData] = useState<Overview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  // Форма ставки (банк)
  const [rateAgency, setRateAgency] = useState("");
  const [ratePct, setRatePct] = useState("");

  // Форма формирования счёта (агентство)
  const now = new Date();
  const prevMonth = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  const prevYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const [genBank, setGenBank] = useState("");
  const [genYear, setGenYear] = useState(String(prevYear));
  const [genMonth, setGenMonth] = useState(String(prevMonth));

  const reload = useCallback(async () => setData(await apiBillingOverview()), []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 5000);
  };

  if (!["BANK_ADMIN", "MANAGER", "ACCOUNTANT"].includes(currentUser.role)) {
    return <div className="p-8 text-sm text-muted-foreground">Доступно администратору банка, менеджеру и бухгалтеру.</div>;
  }

  const isBankSide = data?.side === "bank";

  const setCommission = async () => {
    if (!rateAgency || !ratePct) return;
    const res = await apiSetCommission({ data: { agencyId: rateAgency, commissionPct: Number(ratePct) } });
    flash(res.ok ? "Ставка сохранена." : "Ошибка");
    if (res.ok) {
      setRateAgency("");
      setRatePct("");
      await reload();
    }
  };

  const generate = async () => {
    if (!genBank) return;
    const res = await apiGenerateInvoice({
      data: { bankId: genBank, periodYear: Number(genYear), periodMonth: Number(genMonth) },
    });
    flash(res.ok ? "Счёт сформирован — проверьте детализацию и выставьте банку." : res.error ?? "Ошибка");
    if (res.ok) await reload();
  };

  const issue = async (inv: Invoice) => {
    const res = await apiIssueInvoice({ data: { invoiceId: inv.id } });
    flash(res.ok ? `Счёт ${inv.number} выставлен банку.` : res.error ?? "Ошибка");
    if (res.ok) await reload();
  };

  const resolve = async (inv: Invoice, action: "PAY" | "DISPUTE", reason?: string) => {
    const res = await apiResolveInvoice({ data: { invoiceId: inv.id, action, reason } });
    flash(res.ok ? (action === "PAY" ? "Оплата подтверждена." : "Счёт оспорен — исполнитель может пересформировать.") : res.error ?? "Ошибка");
    if (res.ok) {
      setDisputeFor(null);
      setDisputeReason("");
      await reload();
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Взаиморасчёты</h1>
        <p className="text-sm text-muted-foreground">
          Success fee за отчётный месяц: комиссия исполнителя от фактически взысканного. Сформирован → выставлен → оплачен/оспорен.
        </p>
      </div>

      {notice && <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">{notice}</div>}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Ставки */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Percent className="h-3.5 w-3.5" /> Ставки вознаграждения
          </div>
          {(data?.agreements ?? []).length === 0 && (
            <div className="mb-2 text-xs text-muted-foreground">
              {isBankSide ? "Ставки ещё не заданы." : "Банки ещё не задали ставку для вашей организации."}
            </div>
          )}
          {(data?.agreements ?? []).map((a) => (
            <div key={a.bankId + a.agencyId} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
              <span>{isBankSide ? a.agencyName : a.bankName}</span>
              <span className="font-mono font-semibold">{a.commissionPct}%</span>
            </div>
          ))}
          {isBankSide && currentUser.role === "BANK_ADMIN" && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <select value={rateAgency} onChange={(e) => setRateAgency(e.target.value)} className="flex-1 rounded border border-input bg-background p-1.5 text-xs">
                <option value="">Исполнитель…</option>
                {(data?.counterparties ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <input
                type="number" min={1} max={90} value={ratePct}
                onChange={(e) => setRatePct(e.target.value.replace(/^0+(?=\d)/, ""))}
                placeholder="%" className="w-20 rounded border border-input bg-background p-1.5 text-xs"
              />
              <button disabled={!rateAgency || !ratePct} onClick={setCommission} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40">
                Сохранить
              </button>
            </div>
          )}
        </div>

        {/* Формирование счёта (только исполнитель) */}
        {!isBankSide && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" /> Сформировать счёт за месяц
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={genBank} onChange={(e) => setGenBank(e.target.value)} className="flex-1 rounded border border-input bg-background p-1.5 text-xs">
                <option value="">Банк…</option>
                {(data?.counterparties ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <select value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="rounded border border-input bg-background p-1.5 text-xs">
                {MONTH_LABEL.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <input type="number" value={genYear} onChange={(e) => setGenYear(e.target.value)} className="w-24 rounded border border-input bg-background p-1.5 text-xs" />
              <button disabled={!genBank} onClick={generate} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40">
                Сформировать
              </button>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Система посчитает платежи, зафиксированные по делам выбранного банка за месяц, и применит ставку.
            </div>
          </div>
        )}
      </div>

      {/* Счета */}
      <div className="space-y-3">
        {(data?.invoices ?? []).map((inv) => (
          <div key={inv.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{inv.number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[inv.status]}`}>{STATUS_LABEL[inv.status]}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {MONTH_LABEL[inv.periodMonth - 1]} {inv.periodYear} · {isBankSide ? inv.agencyName : inv.bankName} · ставка {inv.commissionPct}%
                  {inv.issuedAt && <> · выставлен {fmtDateTime(inv.issuedAt)}</>}
                  {inv.paidAt && <> · оплачен {fmtDateTime(inv.paidAt)}</>}
                </div>
                {inv.status === "DISPUTED" && inv.disputeReason && (
                  <div className="mt-1 text-xs text-destructive">Причина спора: {inv.disputeReason}</div>
                )}
              </div>
              <div className="text-right">
                <div className="font-display text-xl font-bold text-money">{fmtUSD(inv.amountUSD)}</div>
                <div className="text-[11px] text-muted-foreground">взыскано {fmtUSD(inv.baseAmountUSD)}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setExpanded(expanded === inv.id ? null : inv.id)} className="rounded border border-border px-2.5 py-1 text-xs hover:bg-accent">
                Детализация · {inv.lines.length} дел
              </button>
              {!isBankSide && inv.status === "DRAFT" && (
                <button onClick={() => issue(inv)} className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground">
                  <Send className="h-3 w-3" /> Выставить банку
                </button>
              )}
              {!isBankSide && inv.status === "DISPUTED" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RefreshCw className="h-3 w-3" /> Пересформируйте счёт за этот период после урегулирования
                </span>
              )}
              {isBankSide && inv.status === "ISSUED" && ["BANK_ADMIN", "ACCOUNTANT"].includes(currentUser.role) && (
                <>
                  <button onClick={() => resolve(inv, "PAY")} className="flex items-center gap-1 rounded bg-success px-2.5 py-1 text-xs text-success-foreground">
                    <Check className="h-3 w-3" /> Подтвердить оплату
                  </button>
                  <button
                    onClick={() => setDisputeFor(disputeFor === inv.id ? null : inv.id)}
                    className="flex items-center gap-1 rounded border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <AlertTriangle className="h-3 w-3" /> Оспорить
                  </button>
                </>
              )}
            </div>

            {disputeFor === inv.id && (
              <div className="mt-2 flex gap-2">
                <input
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Причина (обязательно, уйдёт исполнителю)"
                  className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-xs"
                />
                <button
                  disabled={!disputeReason.trim()}
                  onClick={() => resolve(inv, "DISPUTE", disputeReason)}
                  className="rounded bg-destructive px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-40"
                >
                  Подтвердить
                </button>
              </div>
            )}

            {expanded === inv.id && (
              <div className="mt-3 overflow-x-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Дело</th>
                      <th className="p-2 text-right">Взыскано за период</th>
                      <th className="p-2 text-right">Комиссия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l) => (
                      <tr key={l.caseId} className="border-t border-border/50">
                        <td className="p-2 font-mono">{l.caseCode}</td>
                        <td className="p-2 text-right font-mono">{fmtUSD(l.recoveredUSD)}</td>
                        <td className="p-2 text-right font-mono">{fmtUSD(l.commissionUSD)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {data !== null && data.invoices.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Счетов пока нет.
            {!isBankSide && " Сформируйте первый счёт за отчётный месяц выше."}
          </div>
        )}
      </div>
    </div>
  );
}
