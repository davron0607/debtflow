import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
};

function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    void (async () => setRows((await apiAuditLog()) as AuditRow[]))();
  }, []);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Журнал действий оператора</h1>
        <p className="text-sm text-muted-foreground">
          Append-only. Отдельно от аудита дел банков/агентств — оператор к делам доступа не имеет.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Когда</th>
              <th className="p-3 text-left">Действие</th>
              <th className="p-3 text-left">Организация</th>
              <th className="p-3 text-left">Причина</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((e) => (
              <tr key={e.id} className="border-t border-border/50 hover:bg-surface-2">
                <td className="whitespace-nowrap p-3 font-mono text-xs text-muted-foreground">{fmtDateTime(e.createdAt)}</td>
                <td className="p-3 text-xs font-medium">{TYPE_LABEL[e.type] ?? e.type}</td>
                <td className="p-3 text-xs">{e.targetOrgName ?? "—"}</td>
                <td className="p-3 text-xs text-muted-foreground">{e.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows !== null && rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Действий пока не было.</div>}
      </div>
    </div>
  );
}
