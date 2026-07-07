import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiDashboardStats } from "@/lib/api";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

type Stats = {
  totalOrgs: number;
  totalUsers: number;
  activeUsers: number;
  totalCases: number;
  activeCases: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  weeks: { weekStart: string; orgs: number; users: number }[];
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "активна",
  PENDING: "на проверке",
  SUSPENDED: "приостановлена",
  REJECTED: "отклонена",
  ARCHIVED: "закрыта",
};

const TYPE_LABEL: Record<string, string> = {
  BANK: "Банк",
  MFO: "МФО",
  COLLECTOR: "Коллекторское агентство",
  LEGAL_FIRM: "Юридическая фирма",
};

function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void (async () => setStats((await apiDashboardStats()) as Stats))();
  }, []);

  const maxWeekly = stats ? Math.max(1, ...stats.weeks.map((w) => Math.max(w.orgs, w.users))) : 1;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Дашборд платформы</h1>
        <p className="text-sm text-muted-foreground">
          Сводные метрики по всем организациям. Только количество дел (для контроля квот) — суммы, должники,
          документы и платежи оператору не видны.
        </p>
      </div>

      {!stats ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Организаций" value={stats.totalOrgs} />
            <StatCard label="Пользователей" value={stats.totalUsers} />
            <StatCard label="Активных пользователей" value={stats.activeUsers} />
            <StatCard label="Дел у банков/МФО" value={stats.totalCases} />
            <StatCard label="Из них в работе" value={stats.activeCases} />
            <StatCard label="Приостановлено" value={stats.byStatus.SUSPENDED ?? 0} tone={stats.byStatus.SUSPENDED ? "destructive" : "default"} />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">По статусу</h2>
              <div className="space-y-2">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span>{STATUS_LABEL[status] ?? status}</span>
                    <span className="font-mono text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">По типу организации</h2>
              <div className="space-y-2">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-sm">
                    <span>{TYPE_LABEL[type] ?? type}</span>
                    <span className="font-mono text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Рост за 8 недель
            </h2>
            <div className="flex items-end gap-3 overflow-x-auto pb-1">
              {stats.weeks.map((w) => (
                <div key={w.weekStart} className="flex min-w-[52px] flex-col items-center gap-1">
                  <div className="flex h-32 items-end gap-1">
                    <div
                      className="w-3 rounded-t bg-primary/70"
                      style={{ height: `${(w.orgs / maxWeekly) * 100}%` }}
                      title={`Организаций: ${w.orgs}`}
                    />
                    <div
                      className="w-3 rounded-t bg-money/70"
                      style={{ height: `${(w.users / maxWeekly) * 100}%` }}
                      title={`Пользователей: ${w.users}`}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(w.weekStart).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-primary/70" /> Организации
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-money/70" /> Пользователи
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "destructive" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${tone === "destructive" && value > 0 ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
