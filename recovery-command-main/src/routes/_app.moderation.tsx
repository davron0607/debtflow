import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Check, X, Globe, MailCheck, MailX } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { apiModerationList, apiModerateOrg } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/moderation")({
  component: ModerationPage,
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

const TYPE_LABEL: Record<string, string> = {
  BANK: "Банк",
  MFO: "МФО",
  COLLECTOR: "Коллекторское агентство",
  LEGAL_FIRM: "Юридическая фирма",
};

function ModerationPage() {
  const { currentUser } = useStore();
  const [orgs, setOrgs] = useState<PendingOrg[] | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await apiModerationList();
    setOrgs(list as PendingOrg[]);
  }, []);

  useEffect(() => {
    if (currentUser.role === "PLATFORM_ADMIN") void reload();
  }, [currentUser.role, reload]);

  if (currentUser.role !== "PLATFORM_ADMIN") {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="font-display text-3xl font-bold">Модерация организаций</h1>
        <p className="mt-2 text-sm text-muted-foreground">Доступно только оператору платформы.</p>
      </div>
    );
  }

  const decide = async (orgId: string, decision: "APPROVE" | "REJECT", why?: string) => {
    const res = await apiModerateOrg({ data: { orgId, decision, reason: why } });
    if (res.ok) {
      setNotice(decision === "APPROVE" ? "Организация одобрена — доступ открыт, письмо отправлено." : "Заявка отклонена, письмо отправлено.");
      setRejectFor(null);
      setReason("");
      await reload();
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const pending = (orgs ?? []).filter((o) => o.status === "PENDING");
  const rejected = (orgs ?? []).filter((o) => o.status === "REJECTED");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="font-display text-3xl font-bold">Модерация организаций</h1>
          <p className="text-sm text-muted-foreground">
            Банки и МФО получают доступ к загрузке портфеля и назначениям только после проверки.
            Домен и MX уже проверены автоматически; e-mail подтверждён владельцем.
          </p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">{notice}</div>
      )}

      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        На проверке · {pending.length}
      </h2>
      <div className="space-y-3">
        {pending.map((o) => (
          <div key={o.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-semibold">{o.name}</span>
                  <span className="rounded-full bg-money/10 px-2 py-0.5 text-xs text-money">
                    {TYPE_LABEL[o.type] ?? o.type}
                  </span>
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
                      {o.admin.emailVerified ? (
                        <MailCheck className="h-3 w-3 text-success" />
                      ) : (
                        <MailX className="h-3 w-3 text-destructive" />
                      )}
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
        {orgs !== null && pending.length === 0 && (
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
                <button
                  onClick={() => decide(o.id, "APPROVE")}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Одобрить всё же
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
