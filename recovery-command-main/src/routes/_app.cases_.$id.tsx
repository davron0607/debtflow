import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  ShieldAlert,
  Stamp,
  Gavel,
  Coins,
  Clock,
  History,
  Wallet,
  ClipboardList,
  Building2,
} from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD, fmtUZS, fmtDateTime, fmtDate } from "@/lib/format";
import { STATUS_LABEL, allowedTransitions, statusTone } from "@/lib/state-machine";
import { StatusBadge } from "@/components/status-badge";
import { LifecycleSpine } from "@/components/lifecycle-spine";
import { DecisionPanel } from "@/components/decision-panel";
import type { CaseStatus, DocumentKind } from "@/lib/store/types";

export const Route = createFileRoute("/_app/cases_/$id")({
  component: CaseDetail,
});

type Tab = "docs" | "payments" | "costs" | "sla" | "assignments" | "audit";

function CaseDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const {
    db,
    caseById,
    currentUser,
    eventsFor,
    transitionStatus,
    generateDocument,
    addCost,
    setEnforcementRoute,
    initiateTransfer,
    writeOff,
    logContact,
    logPromise,
    recordPayment,
    assignCaseUser,
  } = useStore();

  const c = caseById(id);
  const [tab, setTab] = useState<Tab>("docs");
  const [reason, setReason] = useState("");
  const [pendingStatus, setPendingStatus] = useState<CaseStatus | null>(null);
  const [contactNote, setContactNote] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmt, setPromiseAmt] = useState("");
  const [paymentAmt, setPaymentAmt] = useState("");
  const [costKind, setCostKind] = useState<"STORAGE" | "EXPERTISE" | "LEGAL" | "OTHER">("LEGAL");
  const [costAmt, setCostAmt] = useState("");
  const [costNote, setCostNote] = useState("");

  if (!c) {
    return (
      <div className="p-8">
        <p>Дело не найдено или недоступно для вашей роли.</p>
        <Link to="/cases" className="text-primary hover:underline">← К списку</Link>
      </div>
    );
  }

  const debtor = db.debtors.find((d) => d.id === c.debtorId);
  const org = db.orgs.find((o) => o.id === c.assignedOrgId);
  const docs = db.documents.filter((d) => d.caseId === c.id);
  const payments = db.payments.filter((p) => p.caseId === c.id);
  const costs = db.costs.filter((k) => k.caseId === c.id);
  const slas = db.slas.filter((s) => s.caseId === c.id);
  const assigns = db.assignments.filter((a) => a.caseId === c.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const events = eventsFor(c.id);
  const transitions = allowedTransitions(c.status, currentUser.role);
  const totalCosts = costs.reduce((s, k) => s + k.amountUSD, 0);
  const totalPaid = payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amountUSD, 0);

  const commitTransition = (to: CaseStatus) => {
    const destructive = to === "WRITTEN_OFF" || to === "CLOSED";
    if (destructive) {
      setPendingStatus(to);
      return;
    }
    transitionStatus(c.id, to);
  };

  const confirmDestructive = () => {
    if (!pendingStatus || !reason.trim()) return;
    if (pendingStatus === "WRITTEN_OFF") writeOff(c.id, reason);
    else transitionStatus(c.id, pendingStatus, reason);
    setPendingStatus(null);
    setReason("");
  };

  return (
    <div className="p-6 lg:p-8">
      <button onClick={() => router.history.back()} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Назад
      </button>

      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <span className="font-mono">{c.code}</span> · создано {fmtDate(c.createdAt)}
            </div>
            <h1 className="font-display text-2xl font-bold">{debtor?.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>ПИНФЛ <span className="font-mono text-foreground">{debtor?.pinfl}</span></span>
              <span>Тел. <span className="font-mono text-foreground">{debtor?.phone}</span></span>
              <span>{debtor?.address}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-bold text-money">{fmtUSD(c.amountUSD)}</div>
            <div className="font-mono text-xs text-muted-foreground">{fmtUZS(c.amountUZS)}</div>
            <div className="mt-2 flex justify-end gap-2 text-xs">
              <span className={`rounded px-2 py-0.5 ${c.collateral ? "bg-money/20 text-money" : "bg-surface-2"}`}>
                {c.collateral ? "SECURED" : "UNSECURED"}
              </span>
              <span className="rounded bg-surface-2 px-2 py-0.5">DPD {c.dpd}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <LifecycleSpine status={c.status} />
          <StatusBadge status={c.status} />
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {org ? (
              <span>Назначено: <Building2 className="inline h-3 w-3" /> <b className="text-foreground">{org.name}</b></span>
            ) : (
              <span>Не назначено</span>
            )}
            {/* Исполнитель внутри организации: учёт и GPS привязаны к сотруднику */}
            {org && (
              ["MANAGER", "BANK_ADMIN"].includes(currentUser.role) && currentUser.orgId === org.id ? (
                <label className="flex items-center gap-1.5">
                  Исполнитель:
                  <select
                    value={c.assignedUserId ?? ""}
                    onChange={(e) => assignCaseUser(c.id, e.target.value || null)}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
                  >
                    <option value="">— не распределено —</option>
                    {db.users
                      .filter(
                        (x) =>
                          x.orgId === org.id &&
                          x.active !== false &&
                          ["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR", "LEGAL_FIRM"].includes(x.role),
                      )
                      .map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                  </select>
                </label>
              ) : c.assignedUserId ? (
                <span>
                  Исполнитель: <b className="text-foreground">{db.users.find((x) => x.id === c.assignedUserId)?.name ?? "—"}</b>
                </span>
              ) : (
                <span className="text-money">Исполнитель не распределён</span>
              )
            )}
          </div>
        </div>

        <DecisionPanel c={c} />

        {/* State transitions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {transitions.length === 0 && (
            <span className="text-xs text-muted-foreground">Нет доступных переходов для роли «{currentUser.role}»</span>
          )}
          {transitions.map((t) => (
            <button
              key={t.to}
              onClick={() => commitTransition(t.to)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                t.destructive
                  ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                  : "border-primary/40 text-primary hover:bg-primary/10"
              }`}
            >
              {t.label ?? STATUS_LABEL[t.to]}
            </button>
          ))}
        </div>

        {/* Enforcement routing */}
        {(c.status === "ESCALATED_TO_LEGAL" || c.status === "COURT_PACKAGE_READY" || c.status === "PRE_CLAIM_SENT") && (
          <div className="mt-5 rounded-md border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Gavel className="h-3.5 w-3.5" /> Маршрут принуждения
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setEnforcementRoute(c.id, "NOTARY")}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  c.enforcementRoute === "NOTARY" ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                <Stamp className="mr-1 inline h-3 w-3" />
                Нотариус (исполнительная надпись, ~3 нед) — для бесспорных
              </button>
              <button
                onClick={() => setEnforcementRoute(c.id, "COURT")}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  c.enforcementRoute === "COURT" ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                <Gavel className="mr-1 inline h-3 w-3" />
                E-SUD (исковое) — для спорных
              </button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                Оба маршрута сходятся в МИБ (в V1 — ручное ведение).
              </span>
            </div>
          </div>
        )}

        {/* Collector / accountant inline actions */}
        {(["COLLECTOR", "SOFT_COLLECTOR", "HARD_COLLECTOR"].includes(currentUser.role) ||
          currentUser.role === "ACCOUNTANT") &&
          c.assignedOrgId === currentUser.orgId && (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {currentUser.role !== "ACCOUNTANT" && (<>
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Лог контакта</div>
              <textarea
                value={contactNote}
                onChange={(e) => setContactNote(e.target.value)}
                placeholder="Кратко: что обсудили, обещания, отговорки"
                className="mb-2 h-16 w-full rounded border border-input bg-background p-2 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { logContact(c.id, contactNote || "Контакт", "CONTACTED"); setContactNote(""); }}
                  className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                >
                  Контакт есть
                </button>
                <button
                  onClick={() => { logContact(c.id, contactNote || "Не отвечает", "NO_CONTACT"); setContactNote(""); }}
                  className="flex-1 rounded border border-destructive/40 px-2 py-1 text-xs text-destructive"
                >
                  Нет контакта
                </button>
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Обещание оплаты</div>
              <input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)}
                className="mb-2 w-full rounded border border-input bg-background p-1.5 text-xs" />
              <input type="number" value={promiseAmt} onChange={(e) => setPromiseAmt(e.target.value)} placeholder="Сумма USD"
                className="mb-2 w-full rounded border border-input bg-background p-1.5 text-xs" />
              <button
                disabled={!promiseDate || !promiseAmt}
                onClick={() => { logPromise(c.id, new Date(promiseDate).toISOString(), Number(promiseAmt)); setPromiseDate(""); setPromiseAmt(""); }}
                className="w-full rounded bg-money px-2 py-1 text-xs text-money-foreground disabled:opacity-40"
              >
                Зафиксировать обещание
              </button>
            </div>
            </>)}
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {currentUser.role === "ACCOUNTANT" ? "Подтверждение оплаты" : "Записать платёж"}
              </div>
              <input type="number" value={paymentAmt} onChange={(e) => setPaymentAmt(e.target.value)} placeholder="Сумма USD"
                className="mb-2 w-full rounded border border-input bg-background p-1.5 text-xs" />
              <div className="flex gap-2">
                <button
                  disabled={!paymentAmt}
                  onClick={() => { recordPayment(c.id, Number(paymentAmt), "PARTIAL"); setPaymentAmt(""); }}
                  className="flex-1 rounded border border-primary/40 px-2 py-1 text-xs text-primary disabled:opacity-40"
                >
                  Частично
                </button>
                <button
                  disabled={!paymentAmt}
                  onClick={() => { recordPayment(c.id, Number(paymentAmt), "FULL"); setPaymentAmt(""); }}
                  className="flex-1 rounded bg-success px-2 py-1 text-xs text-success-foreground disabled:opacity-40"
                >
                  Полностью
                </button>
              </div>
              {c.status === "PAID" && currentUser.role === "COLLECTOR" && (
                <button
                  onClick={() => initiateTransfer(c.id, c.amountUSD)}
                  className="mt-2 w-full rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                >
                  <Wallet className="mr-1 inline h-3 w-3" /> Инициировать перевод
                </button>
              )}
            </div>
          </div>
        )}

        {/* Legal firm inline: doc generator */}
        {(currentUser.role === "LEGAL_FIRM" || currentUser.role === "BANK_LEGAL") && (
          <div className="mt-5 flex flex-wrap gap-2">
            {(["PRE_CLAIM", "COURT_PACKAGE", "CALC", "MIB_SUBMISSION"] as DocumentKind[]).map((k) => (
              <button
                key={k}
                onClick={() =>
                  generateDocument(
                    c.id,
                    k,
                    k === "PRE_CLAIM" ? "Претензионное письмо" :
                    k === "COURT_PACKAGE" ? "Пакет для суда" :
                    k === "CALC" ? "Расчёт задолженности" : "Подача в МИБ",
                  )
                }
                className="rounded-md border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10"
              >
                <FileText className="mr-1 inline h-3 w-3" />
                {k === "PRE_CLAIM" ? "Претензия" :
                 k === "COURT_PACKAGE" ? "Пакет для суда" :
                 k === "CALC" ? "Расчёт" : "МИБ-подача"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cost & payment summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile label="Взыскано" value={fmtUSD(totalPaid)} tone="success" icon={Coins} />
        <SummaryTile label="Расходы (cost-to-recover)" value={fmtUSD(totalCosts)} tone="money" icon={Wallet} />
        <SummaryTile label="Документов" value={String(docs.length)} tone="default" icon={FileText} />
        <SummaryTile label="Событий в аудите" value={String(events.length)} tone="default" icon={History} />
      </div>

      {/* Tabs */}
      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {([
            ["docs", "Документы", FileText],
            ["payments", "Платежи", Coins],
            ["costs", "Затраты", Wallet],
            ["sla", "SLA", Clock],
            ["assignments", "История назначений", Building2],
            ["audit", "Аудит", ClipboardList],
          ] as [Tab, string, typeof FileText][]).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${
                tab === k ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3 w-3" /> {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "docs" && (
            <div className="space-y-2">
              {docs.length === 0 && <Empty label="Документов пока нет. Сгенерируйте претензию или пакет для суда." />}
              {docs.map((d) => (
                <div key={d.id} className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{d.title}</div>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{d.kind}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fmtDateTime(d.generatedAt)} · подписано ЭЦП (операционно): <span className="font-mono">{d.signedByEds ?? "—"}</span>
                  </div>
                  <div className="mt-2 rounded bg-mist p-3 text-xs text-mist-foreground">
                    {d.bodyPreview}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "payments" && (
            <div className="space-y-2">
              {payments.length === 0 && <Empty label="Платежей и обещаний пока нет." />}
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3 text-sm">
                  <span>
                    {p.kind === "PROMISE" ? "Обещание" : p.kind === "PARTIAL" ? "Частичный платёж" : "Полный платёж"}
                    {p.promisedDate && <> · до {fmtDate(p.promisedDate)}</>}
                    {p.paidAt && <> · {fmtDateTime(p.paidAt)}</>}
                  </span>
                  <span className="font-mono text-money">{fmtUSD(p.amountUSD)}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "costs" && (
            <div className="space-y-3">
              {(currentUser.role === "BANK_ADMIN" || currentUser.role === "BANK_LEGAL") && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 p-3">
                  <select value={costKind} onChange={(e) => setCostKind(e.target.value as "STORAGE" | "EXPERTISE" | "LEGAL" | "OTHER")}
                    className="rounded border border-input bg-background px-2 py-1 text-xs">
                    <option value="LEGAL">Юридические</option>
                    <option value="STORAGE">Стоянка залога</option>
                    <option value="EXPERTISE">Экспертиза</option>
                    <option value="OTHER">Прочее</option>
                  </select>
                  <input type="number" value={costAmt} onChange={(e) => setCostAmt(e.target.value)} placeholder="USD"
                    className="w-24 rounded border border-input bg-background px-2 py-1 text-xs" />
                  <input value={costNote} onChange={(e) => setCostNote(e.target.value)} placeholder="Комментарий"
                    className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
                  <button
                    disabled={!costAmt}
                    onClick={() => { addCost(c.id, costKind, Number(costAmt), costNote); setCostAmt(""); setCostNote(""); }}
                    className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-40"
                  >
                    + Добавить затрату
                  </button>
                </div>
              )}
              {costs.length === 0 && <Empty label="Затрат по делу нет." />}
              {costs.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-md border border-border bg-surface-2 p-3 text-sm">
                  <span>{k.kind} · {k.note}</span>
                  <span className="font-mono text-money">{fmtUSD(k.amountUSD)}</span>
                </div>
              ))}
            </div>
          )}
          {tab === "sla" && (
            <div className="space-y-2">
              {slas.length === 0 && <Empty label="SLA-таймеров нет." />}
              {slas.map((s) => (
                <div key={s.id} className={`flex items-center justify-between rounded-md border p-3 text-sm ${
                  s.breached ? "border-destructive/40 bg-destructive/10" : "border-border bg-surface-2"
                }`}>
                  <span>{s.type}</span>
                  <span className="font-mono text-xs">
                    {fmtDate(s.dueAt)} · {s.breached ? <span className="text-destructive">нарушен</span> : <span className="text-success">в пределах</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {tab === "assignments" && (
            <div className="space-y-2">
              {assigns.length === 0 && <Empty label="Назначений ещё не было." />}
              {assigns.map((a) => {
                const to = db.orgs.find((o) => o.id === a.toOrgId);
                const from = db.orgs.find((o) => o.id === a.fromOrgId);
                const by = db.users.find((u) => u.id === a.byUserId);
                return (
                  <div key={a.id} className="rounded-md border border-border bg-surface-2 p-3 text-sm">
                    <div>{from ? `${from.name} → ` : ""}<b>{to?.name}</b></div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(a.at)} · {by?.name} {a.reason && `· «${a.reason}»`}</div>
                  </div>
                );
              })}
            </div>
          )}
          {tab === "audit" && (
            <div className="space-y-1">
              {events.map((e) => {
                const u = db.users.find((x) => x.id === e.actorUserId);
                return (
                  <div key={e.id} className="flex items-start gap-3 rounded-md border border-border bg-surface-2 p-2 text-xs">
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <b className="font-mono text-primary">{e.type}</b>
                        <span className="text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
                      </div>
                      <div className="text-muted-foreground">{u?.name ?? "—"} · {JSON.stringify(e.payload)}</div>
                      {e.reason && <div className="mt-0.5 text-destructive">Причина: {e.reason}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Destructive confirmation modal */}
      {pendingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-destructive/40 bg-surface p-6">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <h3 className="font-display text-lg font-semibold">Требуется обоснование</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Действие «{STATUS_LABEL[pendingStatus]}» — деструктивное. Причина будет записана в неизменяемый аудит.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Причина (обязательно)"
              className="mb-3 h-24 w-full rounded border border-input bg-background p-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPendingStatus(null); setReason(""); }} className="rounded border border-border px-3 py-1.5 text-sm">
                Отмена
              </button>
              <button
                onClick={confirmDestructive}
                disabled={!reason.trim()}
                className="rounded bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-40"
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{label}</div>;
}

function SummaryTile({
  label, value, tone, icon: Icon,
}: { label: string; value: string; tone: "success" | "money" | "default"; icon: typeof Coins }) {
  const cls = tone === "success" ? "text-success" : tone === "money" ? "text-money" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`font-display text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
