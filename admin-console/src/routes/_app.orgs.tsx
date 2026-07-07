import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, X, Globe, MailCheck, MailX, Ban, RotateCcw, Building2, Users } from "lucide-react";
import { apiModerationList, apiModerateOrg, apiOrgList, apiSetOrgSuspension } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/orgs")({
  component: OrgsPage,
});

type PendingOrg = {
  id: string;
  name: string;
  type: string;
  status: string;
  domain: string | null;
  createdAt: string;
  admin: { name: string; email: string; emailVerified: boolean } | null;
};

type OrgRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  domain: string | null;
  createdAt: string;
  userCount: number;
  activeUserCount: number;
  lastActivityAt: string | null;
  admin: { name: string; email: string } | null;
};

const TYPE_LABEL: Record<string, string> = {
  BANK: "Банк",
  MFO: "МФО",
  COLLECTOR: "Коллекторское агентство",
  LEGAL_FIRM: "Юридическая фирма",
};

type TabKey = "pending" | "all";

function OrgsPage() {
  const [tab, setTab] = useState<TabKey>("pending");
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[] | null>(null);
  const [allOrgs, setAllOrgs] = useState<OrgRow[] | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [suspendFor, setSuspendFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const reloadPending = useCallback(async () => setPendingOrgs((await apiModerationList()) as PendingOrg[]), []);
  const reloadAll = useCallback(async () => setAllOrgs((await apiOrgList()) as OrgRow[]), []);

  useEffect(() => {
    if (tab === "pending") void reloadPending();
    else void reloadAll();
  }, [tab, reloadPending, reloadAll]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  const decide = async (orgId: string, decision: "APPROVE" | "REJECT", why?: string) => {
    const res = await apiModerateOrg({ data: { orgId, decision, reason: why } });
    if (res.ok) {
      flash(decision === "APPROVE" ? "Организация одобрена — доступ открыт, письмо отправлено." : "Заявка отклонена, письмо отправлено.");
      setRejectFor(null);
      setReason("");
      await reloadPending();
    }
  };

  const setSuspension = async (orgId: string, action: "SUSPEND" | "REACTIVATE", why?: string) => {
    const res = await apiSetOrgSuspension({ data: { orgId, action, reason: why } });
    if (res.ok) {
      flash(
        action === "SUSPEND"
          ? "Организация приостановлена — все сессии сотрудников завершены, письмо отправлено."
          : "Доступ восстановлен, письмо отправлено.",
      );
      setSuspendFor(null);
      setReason("");
      await reloadAll();
    } else {
      flash(res.error ?? "Ошибка");
    }
  };

  const pending = (pendingOrgs ?? []).filter((o) => o.status === "PENDING");
  const rejected = (pendingOrgs ?? []).filter((o) => o.status === "REJECTED");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Организации</h1>
        <p className="text-sm text-muted-foreground">
          Модерация заявок и управление доступом. Дела, документы и переписка банков/агентств оператору не видны.
        </p>
      </div>

      {notice && <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">{notice}</div>}

      <div className="mb-5 flex gap-1.5 border-b border-border">
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")} icon={Building2}>
          На проверке {pendingOrgs && `· ${pending.length}`}
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")} icon={Users}>
          Все организации
        </TabButton>
      </div>

      {tab === "pending" && (
        <>
          <div className="space-y-3">
            {pending.map((o) => (
              <div key={o.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-semibold">{o.name}</span>
                      <span className="rounded-full bg-money/10 px-2 py-0.5 text-xs text-money">{TYPE_LABEL[o.type] ?? o.type}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {o.domain && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          <a href={`https://${o.domain}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            {o.domain}
                          </a>
                          <span className="text-success">· MX подтверждён</span>
                        </span>
                      )}
                      {o.admin && (
                        <span className="flex items-center gap-1">
                          {o.admin.emailVerified ? <MailCheck className="h-3 w-3 text-success" /> : <MailX className="h-3 w-3 text-destructive" />}
                          {o.admin.name} · <span className="font-mono">{o.admin.email}</span>
                          {!o.admin.emailVerified && <span className="text-destructive">(e-mail не подтверждён)</span>}
                        </span>
                      )}
                      <span>Заявка: {fmtDateTime(o.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => decide(o.id, "APPROVE")}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Check className="h-3.5 w-3.5" /> Одобрить
                    </button>
                    <button
                      onClick={() => setRejectFor(rejectFor === o.id ? null : o.id)}
                      className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-3.5 w-3.5" /> Отклонить
                    </button>
                  </div>
                </div>
                {rejectFor === o.id && (
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Причина отклонения (уйдёт заявителю письмом)"
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    />
                    <button
                      disabled={!reason.trim()}
                      onClick={() => decide(o.id, "REJECT", reason)}
                      className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-40"
                    >
                      Подтвердить отказ
                    </button>
                  </div>
                )}
              </div>
            ))}
            {pendingOrgs !== null && pending.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Заявок на проверке нет.
              </div>
            )}
          </div>

          {rejected.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Отклонённые · {rejected.length}
              </h2>
              <div className="space-y-2">
                {rejected.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-sm">
                    <span>
                      {o.name} <span className="text-xs text-muted-foreground">· {TYPE_LABEL[o.type] ?? o.type} · {o.domain}</span>
                    </span>
                    <button onClick={() => decide(o.id, "APPROVE")} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                      Одобрить всё же
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "all" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Организация</th>
                <th className="p-3 text-left">Тип</th>
                <th className="p-3 text-left">Статус</th>
                <th className="p-3 text-right">Пользователей</th>
                <th className="p-3 text-left">Последняя активность</th>
                <th className="p-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(allOrgs ?? []).map((o) => (
                <tr key={o.id} className="border-t border-border/50 hover:bg-surface-2">
                  <td className="p-3">
                    <div className="font-medium">{o.name}</div>
                    {o.admin && <div className="text-xs text-muted-foreground">{o.admin.name} · {o.admin.email}</div>}
                  </td>
                  <td className="p-3 text-xs">{TYPE_LABEL[o.type] ?? o.type}</td>
                  <td className="p-3">
                    <StatusChip status={o.status} />
                  </td>
                  <td className="p-3 text-right font-mono text-xs">
                    {o.activeUserCount}/{o.userCount}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{o.lastActivityAt ? fmtDateTime(o.lastActivityAt) : "—"}</td>
                  <td className="p-3 text-right">
                    {o.status === "ACTIVE" && (
                      <button
                        onClick={() => setSuspendFor(suspendFor === o.id ? null : o.id)}
                        className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Ban className="h-3 w-3" /> Приостановить
                      </button>
                    )}
                    {o.status === "SUSPENDED" && (
                      <button
                        onClick={() => setSuspension(o.id, "REACTIVATE")}
                        className="flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-xs text-success hover:bg-success/10"
                      >
                        <RotateCcw className="h-3 w-3" /> Восстановить
                      </button>
                    )}
                    {suspendFor === o.id && (
                      <div className="mt-2 flex gap-1.5">
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Причина приостановки"
                          className="w-40 rounded-md border border-input bg-background px-2 py-1 text-xs"
                        />
                        <button
                          disabled={!reason.trim()}
                          onClick={() => setSuspension(o.id, "SUSPEND", reason)}
                          className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-40"
                        >
                          Подтвердить
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {allOrgs !== null && allOrgs.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Организаций пока нет.</div>}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof Building2; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
        (active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "ACTIVE" ? "bg-success/10 text-success" : status === "SUSPENDED" ? "bg-destructive/10 text-destructive" : status === "PENDING" ? "bg-money/10 text-money" : "bg-surface-2 text-muted-foreground";
  const label = status === "ACTIVE" ? "активна" : status === "SUSPENDED" ? "приостановлена" : status === "PENDING" ? "на проверке" : "отклонена";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
