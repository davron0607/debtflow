import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { fmtUSD } from "@/lib/format";
import { COLLECTOR_ROLES, ROLE_LABEL } from "@/lib/store/types";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
});

// Рейтинг сотрудников внутри одной организации: сравнение своей
// эффективности с коллегами. Атрибуция — по актору событий аудита.
function TeamPage() {
  const { db, currentUser } = useStore();

  const allowed = [...COLLECTOR_ROLES, "LEGAL_FIRM", "MANAGER", "ACCOUNTANT"].includes(currentUser.role);

  const rows = useMemo(() => {
    const workers = db.users.filter(
      (u) =>
        u.orgId === currentUser.orgId &&
        u.active !== false &&
        [...COLLECTOR_ROLES, "LEGAL_FIRM"].includes(u.role),
    );
    return workers
      .map((u) => {
        const myEvents = db.events.filter((e) => e.actorUserId === u.id);
        const recovered = myEvents
          .filter((e) => e.type === "PAYMENT_RECORDED")
          .reduce((s, e) => s + (Number(e.payload["amountUSD"]) || 0), 0);
        const contacts = myEvents.filter((e) => e.type === "CONTACT_LOGGED").length;
        const contactsOk = myEvents.filter(
          (e) => e.type === "CONTACT_LOGGED" && e.payload["result"] === "CONTACTED",
        ).length;
        const promises = myEvents.filter((e) => e.type === "PROMISE_LOGGED").length;
        const visits = db.visits.filter((v) => v.collectorUserId === u.id).length;
        const inWork = db.cases.filter(
          (c) => c.assignedUserId === u.id && !["PAID", "CLOSED", "WRITTEN_OFF", "RESTRUCTURED"].includes(c.status),
        ).length;
        const closed = db.cases.filter(
          (c) => c.assignedUserId === u.id && ["PAID", "CLOSED", "RESTRUCTURED"].includes(c.status),
        ).length;
        // Композитный балл: деньги решают, активность добивает
        const score = recovered + promises * 500 + contactsOk * 200 + visits * 300 + closed * 1000;
        return { u, recovered, contacts, contactsOk, promises, visits, inWork, closed, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [db, currentUser.orgId]);

  if (!allowed) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="font-display text-3xl font-bold">Рейтинг команды</h1>
        <p className="mt-2 text-sm text-muted-foreground">Доступно сотрудникам агентств и юр. фирм.</p>
      </div>
    );
  }

  const maxRecovered = Math.max(1, ...rows.map((r) => r.recovered));
  const maxScore = Math.max(1, ...rows.map((r) => r.score));
  const myRank = rows.findIndex((r) => r.u.id === currentUser.id);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-money" />
          <h1 className="font-display text-3xl font-bold">Рейтинг команды</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {db.orgs.find((o) => o.id === currentUser.orgId)?.name} · сравнение эффективности сотрудников.
          {myRank >= 0 && (
            <>
              {" "}Ваше место: <b className="text-foreground">#{myRank + 1}</b> из {rows.length}.
            </>
          )}
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const me = r.u.id === currentUser.id;
          return (
            <div
              key={r.u.id}
              className={
                "rounded-lg border bg-surface p-4 " +
                (me ? "border-primary ring-1 ring-primary/40" : "border-border")
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "flex h-8 w-8 items-center justify-center rounded-full font-display text-sm font-bold " +
                      (i === 0 ? "bg-money/20 text-money" : "bg-surface-2 text-muted-foreground")
                    }
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-medium">
                      {r.u.name}
                      {me && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">ВЫ</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{ROLE_LABEL[r.u.role]}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-semibold text-success">{fmtUSD(r.recovered)}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">взыскано</div>
                </div>
              </div>

              {/* Визуальное сравнение */}
              <div className="mt-3 space-y-1.5">
                <Bar label="Взыскано" value={r.recovered} max={maxRecovered} fmt={(v) => fmtUSD(v)} tone="bg-success" />
                <Bar label="Общий балл" value={r.score} max={maxScore} fmt={(v) => String(Math.round(v))} tone="bg-primary" />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                <Stat label="В работе" value={String(r.inWork)} />
                <Stat label="Закрыто" value={String(r.closed)} />
                <Stat label="Контакты" value={`${r.contactsOk}/${r.contacts}`} />
                <Stat label="Обещания" value={String(r.promises)} />
                <Stat label="Выезды" value={String(r.visits)} />
                <Stat
                  label="Контактность"
                  value={r.contacts ? Math.round((r.contactsOk / r.contacts) * 100) + "%" : "—"}
                />
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            В организации пока нет сотрудников с рабочими ролями.
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Балл = взысканные $ + 1000·закрытые дела + 500·обещания + 300·выезды + 200·успешные контакты.
        Метрики считаются по неизменяемому аудиту действий.
      </p>
    </div>
  );
}

function Bar({ label, value, max, fmt, tone }: { label: string; value: number; max: number; fmt: (v: number) => string; tone: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right font-mono">{fmt(value)}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
      <div className="font-mono text-sm">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
