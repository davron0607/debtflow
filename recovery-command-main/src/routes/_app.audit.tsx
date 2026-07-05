import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store/store";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { db, scopedCases } = useStore();
  const scopedIds = new Set(scopedCases().map((c) => c.id));
  const events = db.events
    .filter((e) => scopedIds.has(e.caseId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 300);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Аудит-журнал</h1>
        <p className="text-sm text-muted-foreground">
          Неизменяемая запись всех действий. В API нет операций update/delete по событиям.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Когда</th>
              <th className="p-2 text-left">Тип</th>
              <th className="p-2 text-left">Дело</th>
              <th className="p-2 text-left">Актор</th>
              <th className="p-2 text-left">Данные</th>
              <th className="p-2 text-left">Причина</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const u = db.users.find((x) => x.id === e.actorUserId);
              const c = db.cases.find((x) => x.id === e.caseId);
              return (
                <tr key={e.id} className="border-t border-border/50 hover:bg-surface-2">
                  <td className="whitespace-nowrap p-2 font-mono text-muted-foreground">{fmtDateTime(e.createdAt)}</td>
                  <td className="p-2 font-mono text-primary">{e.type}</td>
                  <td className="p-2">
                    {c && <Link to="/cases/$id" params={{ id: c.id }} className="hover:underline">{c.code}</Link>}
                  </td>
                  <td className="p-2">{u?.name ?? "—"}</td>
                  <td className="p-2 font-mono text-[11px] text-muted-foreground">{JSON.stringify(e.payload)}</td>
                  <td className="p-2 text-destructive">{e.reason ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
