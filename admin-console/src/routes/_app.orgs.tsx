import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, Globe, MailCheck, MailX, Ban, RotateCcw, Building2, Users, Archive, ArchiveRestore, Settings2 } from "lucide-react";
import { apiModerationList, apiModerateOrg, apiOrgList, apiBulkOrgAction, apiUpdateOrgQuotas } from "@/lib/api";
import { useStore } from "@/lib/store";
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
  plan: string;
  maxUsers: number | null;
  maxCases: number | null;
  userCount: number;
  activeUserCount: number;
  caseCount: number;
  activeCaseCount: number;
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
type BulkAction = "SUSPEND" | "REACTIVATE" | "ARCHIVE" | "RESTORE";

function OrgsPage() {
  const { isReadOnly } = useStore();
  const [tab, setTab] = useState<TabKey>("pending");
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[] | null>(null);
  const [allOrgs, setAllOrgs] = useState<OrgRow[] | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<{ orgId: string; action: BulkAction } | null>(null);
  const [quotasFor, setQuotasFor] = useState<string | null>(null);
  const [quotaPlan, setQuotaPlan] = useState("");
  const [quotaMaxUsers, setQuotaMaxUsers] = useState("");
  const [quotaMaxCases, setQuotaMaxCases] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [bulkActionPrompt, setBulkActionPrompt] = useState<BulkAction | null>(null);

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

  const runAction = async (orgIds: string[], action: BulkAction, why?: string) => {
    const res = await apiBulkOrgAction({ data: { orgIds, action, reason: why } });
    if (res.ok) {
      const label =
        action === "SUSPEND"
          ? "Приостановлено"
          : action === "REACTIVATE"
            ? "Восстановлено"
            : action === "ARCHIVE"
              ? "Закрыто"
              : "Восстановлено из архива";
      flash(`${label}: ${res.updated}${res.skipped ? `, пропущено (неподходящий статус): ${res.skipped}` : ""}.`);
      setActionFor(null);
      setReason("");
      setBulkActionPrompt(null);
      setBulkReason("");
      setSelected(new Set());
      await reloadAll();
    } else {
      flash(res.error ?? "Ошибка");
    }
  };

  const openQuotas = (o: OrgRow) => {
    setQuotasFor(quotasFor === o.id ? null : o.id);
    setQuotaPlan(o.plan);
    setQuotaMaxUsers(o.maxUsers?.toString() ?? "");
    setQuotaMaxCases(o.maxCases?.toString() ?? "");
  };

  const saveQuotas = async (orgId: string) => {
    const res = await apiUpdateOrgQuotas({
      data: {
        orgId,
        plan: quotaPlan.trim() || "STANDARD",
        maxUsers: quotaMaxUsers.trim() ? Number(quotaMaxUsers) : null,
        maxCases: quotaMaxCases.trim() ? Number(quotaMaxCases) : null,
      },
    });
    flash(res.ok ? "Тариф и квоты обновлены." : res.error ?? "Ошибка");
    if (res.ok) {
      setQuotasFor(null);
      await reloadAll();
    }
  };

  const pending = (pendingOrgs ?? []).filter((o) => o.status === "PENDING");
  const rejected = (pendingOrgs ?? []).filter((o) => o.status === "REJECTED");

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableOrgs = useMemo(() => (allOrgs ?? []).filter((o) => o.status !== "PENDING"), [allOrgs]);
  const allSelected = selectableOrgs.length > 0 && selectableOrgs.every((o) => selected.has(o.id));

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableOrgs.map((o) => o.id)));
  };

  const bulkNeedsReason = bulkActionPrompt === "SUSPEND" || bulkActionPrompt === "ARCHIVE";

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
                  {!isReadOnly && (
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
                  )}
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
                    {!isReadOnly && (
                      <button onClick={() => decide(o.id, "APPROVE")} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                        Одобрить всё же
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "all" && (
        <>
          {!isReadOnly && selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">Выбрано: {selected.size}</span>
              <button
                onClick={() => setBulkActionPrompt("SUSPEND")}
                className="flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
              >
                <Ban className="h-3 w-3" /> Приостановить выбранные
              </button>
              <button
                onClick={() => setBulkActionPrompt("REACTIVATE")}
                className="flex items-center gap-1 rounded-md border border-success/40 px-2.5 py-1 text-xs text-success hover:bg-success/10"
              >
                <RotateCcw className="h-3 w-3" /> Восстановить выбранные
              </button>
              <button
                onClick={() => setBulkActionPrompt("ARCHIVE")}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
              >
                <Archive className="h-3 w-3" /> Закрыть выбранные
              </button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:underline">
                Снять выделение
              </button>
            </div>
          )}

          {bulkActionPrompt && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              {bulkNeedsReason && (
                <input
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="Причина (обязательно, уйдёт письмом)"
                  className="w-64 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
              )}
              <button
                disabled={bulkNeedsReason && !bulkReason.trim()}
                onClick={() => runAction([...selected], bulkActionPrompt, bulkReason)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
              >
                Подтвердить
              </button>
              <button
                onClick={() => {
                  setBulkActionPrompt(null);
                  setBulkReason("");
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
              >
                Отмена
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
                <tr>
                  {!isReadOnly && (
                    <th className="w-8 p-3">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                  )}
                  <th className="p-3 text-left">Организация</th>
                  <th className="p-3 text-left">Тип</th>
                  <th className="p-3 text-left">Тариф</th>
                  <th className="p-3 text-left">Статус</th>
                  <th className="p-3 text-right">Пользователей</th>
                  <th className="p-3 text-left">Последняя активность</th>
                  <th className="p-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {(allOrgs ?? []).map((o) => (
                  <>
                    <tr key={o.id} className="border-t border-border/50 hover:bg-surface-2">
                      {!isReadOnly && (
                        <td className="p-3">
                          {o.status !== "PENDING" && (
                            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelected(o.id)} />
                          )}
                        </td>
                      )}
                      <td className="p-3">
                        <div className="font-medium">{o.name}</div>
                        {o.admin && <div className="text-xs text-muted-foreground">{o.admin.name} · {o.admin.email}</div>}
                      </td>
                      <td className="p-3 text-xs">{TYPE_LABEL[o.type] ?? o.type}</td>
                      <td className="p-3 text-xs">
                        <div>{o.plan}</div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className={o.maxUsers != null && o.userCount > o.maxUsers ? "font-semibold text-destructive" : ""}>
                            {o.userCount}{o.maxUsers != null ? `/${o.maxUsers}` : ""} польз.
                          </span>
                          {" · "}
                          <span className={o.maxCases != null && o.activeCaseCount > o.maxCases ? "font-semibold text-destructive" : ""}>
                            {o.activeCaseCount}{o.maxCases != null ? `/${o.maxCases}` : ""} дел
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusChip status={o.status} />
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {o.activeUserCount}/{o.userCount}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{o.lastActivityAt ? fmtDateTime(o.lastActivityAt) : "—"}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openQuotas(o)}
                            title="Тариф и квоты"
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                          >
                            <Settings2 className="h-3 w-3" /> Тариф
                          </button>
                          {!isReadOnly && o.status === "ACTIVE" && (
                            <button
                              onClick={() => setActionFor(actionFor?.orgId === o.id ? null : { orgId: o.id, action: "SUSPEND" })}
                              className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                            >
                              <Ban className="h-3 w-3" /> Приостановить
                            </button>
                          )}
                          {!isReadOnly && o.status === "SUSPENDED" && (
                            <>
                              <button
                                onClick={() => runAction([o.id], "REACTIVATE")}
                                className="flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-xs text-success hover:bg-success/10"
                              >
                                <RotateCcw className="h-3 w-3" /> Восстановить
                              </button>
                              <button
                                onClick={() => setActionFor(actionFor?.orgId === o.id ? null : { orgId: o.id, action: "ARCHIVE" })}
                                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                              >
                                <Archive className="h-3 w-3" /> Закрыть
                              </button>
                            </>
                          )}
                          {!isReadOnly && o.status === "ARCHIVED" && (
                            <button
                              onClick={() => runAction([o.id], "RESTORE")}
                              className="flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-xs text-success hover:bg-success/10"
                            >
                              <ArchiveRestore className="h-3 w-3" /> Восстановить
                            </button>
                          )}
                        </div>
                        {actionFor?.orgId === o.id && (
                          <div className="mt-2 flex gap-1.5">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder={actionFor.action === "SUSPEND" ? "Причина приостановки" : "Причина закрытия"}
                              className="w-40 rounded-md border border-input bg-background px-2 py-1 text-xs"
                            />
                            <button
                              disabled={!reason.trim()}
                              onClick={() => runAction([o.id], actionFor.action, reason)}
                              className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-40"
                            >
                              Подтвердить
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {quotasFor === o.id && (
                      <tr className="border-t border-border/50 bg-surface-2">
                        <td colSpan={isReadOnly ? 7 : 8} className="p-3">
                          <div className="mb-2 text-xs text-muted-foreground">
                            Сейчас: {o.userCount} пользователей, {o.activeCaseCount} дел в работе ({o.caseCount} всего).
                          </div>
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] uppercase text-muted-foreground">Тариф</label>
                              <input
                                value={quotaPlan}
                                onChange={(e) => setQuotaPlan(e.target.value)}
                                disabled={isReadOnly}
                                className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] uppercase text-muted-foreground">Макс. пользователей</label>
                              <input
                                value={quotaMaxUsers}
                                onChange={(e) => setQuotaMaxUsers(e.target.value.replace(/[^0-9]/g, ""))}
                                disabled={isReadOnly}
                                placeholder="без лимита"
                                className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] uppercase text-muted-foreground">Макс. дел</label>
                              <input
                                value={quotaMaxCases}
                                onChange={(e) => setQuotaMaxCases(e.target.value.replace(/[^0-9]/g, ""))}
                                disabled={isReadOnly}
                                placeholder="без лимита"
                                className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                              />
                            </div>
                            {!isReadOnly && (
                              <button
                                onClick={() => saveQuotas(o.id)}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                              >
                                Сохранить
                              </button>
                            )}
                            <button onClick={() => setQuotasFor(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
                              Закрыть
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {allOrgs !== null && allOrgs.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Организаций пока нет.</div>}
          </div>
        </>
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
    status === "ACTIVE"
      ? "bg-success/10 text-success"
      : status === "SUSPENDED"
        ? "bg-destructive/10 text-destructive"
        : status === "PENDING"
          ? "bg-money/10 text-money"
          : status === "ARCHIVED"
            ? "bg-surface-2 text-muted-foreground border border-border"
            : "bg-surface-2 text-muted-foreground";
  const label =
    status === "ACTIVE"
      ? "активна"
      : status === "SUSPENDED"
        ? "приостановлена"
        : status === "PENDING"
          ? "на проверке"
          : status === "ARCHIVED"
            ? "закрыта"
            : "отклонена";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
