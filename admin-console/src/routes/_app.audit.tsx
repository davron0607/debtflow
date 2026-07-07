import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { apiAuditLog } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

type AuditRow = {
  id: string;
  type: string;
  targetOrgId: string | null;
  targetOrgName: string | null;
  payload: unknown;
  reason: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  ORG_MODERATED: "Решение по заявке",
  ORG_SUSPENDED: "Организация приостановлена",
  ORG_REACTIVATED: "Доступ восстановлен",
  ORG_ARCHIVED: "Организация закрыта",
  ORG_RESTORED: "Организация восстановлена из архива",
  ORG_QUOTAS_UPDATED: "Изменён тариф/квоты",
  USER_PASSWORD_RESET: "Сброс пароля пользователя",
  USER_BLOCKED: "Пользователь заблокирован",
  USER_UNLOCKED: "Пользователь разблокирован",
  USER_SESSIONS_REVOKED: "Сессии пользователя завершены",
  OPERATOR_INVITED: "Оператор приглашён",
  OPERATOR_LEVEL_CHANGED: "Изменён уровень доступа оператора",
  OPERATOR_DEACTIVATED: "Оператор деактивирован",
  OPERATOR_REACTIVATED: "Оператор восстановлен",
};

function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [type, setType] = useState("");
  const [orgQuery, setOrgQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const reload = useCallback(async () => {
    setRows(
      (await apiAuditLog({
        data: {
          type: type || undefined,
          orgQuery: orgQuery.trim() || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
        },
      })) as AuditRow[],
    );
  }, [type, orgQuery, from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reset = () => {
    setType("");
    setOrgQuery("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Журнал действий оператора</h1>
        <p className="text-sm text-muted-foreground">
          Append-only. Отдельно от аудита дел банков/агентств — оператор к делам доступа не имеет.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase text-muted-foreground">Тип действия</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          >
            <option value="">Все</option>
            {Object.entries(TYPE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase text-muted-foreground">Организация</label>
          <input
            value={orgQuery}
            onChange={(e) => setOrgQuery(e.target.value)}
            placeholder="Название"
            className="w-40 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase text-muted-foreground">С даты</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase text-muted-foreground">По дату</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          />
        </div>
        {(type || orgQuery || from || to) && (
          <button onClick={reset} className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent">
            Сбросить
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Когда</th>
              <th className="p-3 text-left">Действие</th>
              <th className="p-3 text-left">Организация</th>
              <th className="p-3 text-left">Детали</th>
              <th className="p-3 text-left">Причина</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((e) => (
              <tr key={e.id} className="border-t border-border/50 hover:bg-surface-2">
                <td className="whitespace-nowrap p-3 font-mono text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</td>
                <td className="p-3 text-xs font-medium">{TYPE_LABEL[e.type] ?? e.type}</td>
                <td className="p-3 text-xs">{e.targetOrgName ?? "—"}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {e.payload && typeof e.payload === "object" && "email" in e.payload
                    ? String((e.payload as Record<string, unknown>).email)
                    : "—"}
                </td>
                <td className="p-3 text-xs text-muted-foreground">{e.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows !== null && rows.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {type || orgQuery || from || to ? "Ничего не найдено по фильтрам." : "Действий пока не было."}
          </div>
        )}
      </div>
    </div>
  );
}
