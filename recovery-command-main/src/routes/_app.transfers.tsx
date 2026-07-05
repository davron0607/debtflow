import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Wallet } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/transfers")({
  component: TransfersPage,
});

function TransfersPage() {
  const {
    db,
    currentUser,
    scopedCases,
    approveTransferAsManager,
    approveTransferAsAccountant,
    transitionStatus,
  } = useStore();

  const scopedIds = new Set(scopedCases().map((c) => c.id));
  const transfers = db.transfers.filter((t) => scopedIds.has(t.caseId));

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Перевод взысканных средств</h1>
        <p className="text-sm text-muted-foreground">
          Цепочка согласования: <b>Коллектор</b> → <b>Менеджер</b> → <b>Бухгалтер</b>. Каждый шаг — событие в аудите.
        </p>
      </div>

      <div className="space-y-3">
        {transfers.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Нет активных переводов. Инициируйте перевод в карточке оплаченного дела (роль «Коллектор»).
          </div>
        )}
        {transfers.map((t) => {
          const c = db.cases.find((x) => x.id === t.caseId);
          const initiator = db.users.find((u) => u.id === t.initiatedByUserId);
          const managerApproved = !!t.managerApprovedAt;
          const accountantApproved = !!t.accountantApprovedAt;
          return (
            <div key={t.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-money" />
                  {c && (
                    <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-primary hover:underline">
                      {c.code}
                    </Link>
                  )}
                  <span className="font-mono text-lg text-money">{fmtUSD(t.amountUSD)}</span>
                </div>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{t.status}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <Step label="Инициировал коллектор" done at={fmtDateTime(t.initiatedAt)} who={initiator?.name} />
                <Sep />
                <Step
                  label="Одобрение менеджера"
                  done={managerApproved}
                  at={managerApproved ? fmtDateTime(t.managerApprovedAt!) : undefined}
                  who={managerApproved ? db.users.find((u) => u.id === t.managerApprovedByUserId)?.name : undefined}
                />
                <Sep />
                <Step
                  label="Одобрение бухгалтера"
                  done={accountantApproved}
                  at={accountantApproved ? fmtDateTime(t.accountantApprovedAt!) : undefined}
                  who={accountantApproved ? db.users.find((u) => u.id === t.accountantApprovedByUserId)?.name : undefined}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {!managerApproved && currentUser.role === "MANAGER" && (
                  <button onClick={() => approveTransferAsManager(t.id)} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                    Одобрить (менеджер)
                  </button>
                )}
                {managerApproved && !accountantApproved && currentUser.role === "ACCOUNTANT" && (
                  <button onClick={() => approveTransferAsAccountant(t.id)} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">
                    Одобрить (бухгалтер)
                  </button>
                )}
                {accountantApproved && c && c.status === "PAID" && currentUser.role === "BANK_ADMIN" && (
                  <button
                    onClick={() => transitionStatus(c.id, "CLOSED", "Средства получены и подтверждены")}
                    className="rounded bg-success px-3 py-1.5 text-xs text-success-foreground"
                  >
                    Закрыть дело
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step({ label, done, at, who }: { label: string; done: boolean; at?: string; who?: string }) {
  return (
    <div className="flex items-start gap-2">
      {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
      <div>
        <div className={done ? "text-foreground" : "text-muted-foreground"}>{label}</div>
        {at && <div className="text-[11px] text-muted-foreground">{who} · {at}</div>}
      </div>
    </div>
  );
}
function Sep() { return <span className="h-px w-6 bg-border" />; }
