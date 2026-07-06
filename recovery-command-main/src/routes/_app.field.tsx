import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Navigation, CheckCircle2, Smartphone } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { VISIT_RESULT_LABEL, type VisitResult } from "@/lib/store/types";
import { StatusBadge } from "@/components/status-badge";
import { fmtUSD, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/field")({
  component: FieldPage,
});

// Fallback for the demo when geolocation is denied/unavailable: центр Ташкента
const FALLBACK = { lat: 41.311, lng: 69.28 };

function FieldPage() {
  const { db, currentUser, scopedCases, scopedVisits, startVisit, completeVisit } = useStore();
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  if (currentUser.role !== "COLLECTOR" && currentUser.role !== "HARD_COLLECTOR") {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="font-display text-3xl font-bold">Полевой режим</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Мобильный кабинет выездного коллектора. Доступен пользователям с ролью «Коллектор». Мониторинг
          выездов — на странице «GPS-мониторинг».
        </p>
      </div>
    );
  }

  const myVisits = scopedVisits().filter((v) => v.collectorUserId === currentUser.id);
  const activeVisit = myVisits.find((v) => v.id === activeVisitId && !v.endedAt) ?? null;
  const visitedToday = new Set(
    myVisits
      .filter((v) => new Date(v.startedAt).toDateString() === new Date().toDateString())
      .map((v) => v.caseId),
  );

  const WORKABLE = new Set([
    "ASSIGNED", "SOFT_COLLECTION", "CONTACTED", "NO_CONTACT",
    "PROMISE_TO_PAY", "PROMISE_BROKEN", "PARTIALLY_PAID",
  ]);
  const route = scopedCases()
    .filter((c) => WORKABLE.has(c.status))
    .sort((a, b) => b.dpd - a.dpd);

  const getPosition = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(FALLBACK);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(FALLBACK),
        { timeout: 4000 },
      );
    });

  const checkIn = async (caseId: string) => {
    setError(null);
    setLocating(true);
    const pos = await getPosition();
    setLocating(false);
    const res = await startVisit(caseId, pos.lat, pos.lng);
    if (!res.ok) return setError(res.error!);
    setActiveVisitId(res.visitId!);
    setNote("");
  };

  const finish = async (result: VisitResult) => {
    if (!activeVisit) return;
    const res = await completeVisit(activeVisit.id, result, note || undefined);
    if (!res.ok) return setError(res.error!);
    setActiveVisitId(null);
    setNote("");
  };

  return (
    <div className="mx-auto max-w-md p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-display text-xl font-bold">Полевой режим</h1>
          <p className="text-xs text-muted-foreground">
            Выезды с GPS-фиксацией · сегодня посещено: {visitedToday.size}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {activeVisit ? (
        <ActiveVisitCard
          visit={activeVisit}
          caseCode={db.cases.find((c) => c.id === activeVisit.caseId)?.code ?? ""}
          debtorName={
            db.debtors.find((d) => d.id === db.cases.find((c) => c.id === activeVisit.caseId)?.debtorId)?.name ?? ""
          }
          note={note}
          setNote={setNote}
          onFinish={finish}
        />
      ) : (
        <div className="space-y-2">
          {route.map((c) => {
            const debtor = db.debtors.find((d) => d.id === c.debtorId);
            const done = visitedToday.has(c.id);
            return (
              <div key={c.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-xs text-primary hover:underline">
                      {c.code}
                    </Link>
                    <div className="truncate font-medium">{debtor?.name}</div>
                    <div className="flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="truncate">{debtor?.address}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold text-money">{fmtUSD(c.amountUSD)}</div>
                    <div className="text-xs text-muted-foreground">DPD {c.dpd}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <StatusBadge status={c.status} />
                  {done ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> сегодня был выезд
                    </span>
                  ) : (
                    <button
                      onClick={() => checkIn(c.id)}
                      disabled={locating}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      {locating ? "GPS..." : "Начать выезд"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {route.length === 0 && (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
              Нет дел для выезда. Новые назначения появятся здесь.
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Мои последние выезды
        </h2>
        <div className="space-y-1.5">
          {myVisits
            .slice()
            .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
            .slice(0, 6)
            .map((v) => {
              const c = db.cases.find((x) => x.id === v.caseId);
              return (
                <div key={v.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs">
                  <div>
                    <span className="font-mono text-primary">{c?.code}</span>
                    <span className="ml-2 text-muted-foreground">{fmtDateTime(v.startedAt)}</span>
                  </div>
                  <span className={v.result === "NO_CONTACT" || v.result === "REFUSED" ? "text-destructive" : "text-success"}>
                    {v.result ? VISIT_RESULT_LABEL[v.result] : "в процессе"}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        GPS фиксируется в момент начала выезда и записывается в неизменяемый аудит-журнал. Геолокация —
        инструмент операционного контроля агентства, а не давления на должника.
      </p>
    </div>
  );
}

function ActiveVisitCard({
  visit,
  caseCode,
  debtorName,
  note,
  setNote,
  onFinish,
}: {
  visit: { lat: number; lng: number; startedAt: string };
  caseCode: string;
  debtorName: string;
  note: string;
  setNote: (v: string) => void;
  onFinish: (r: VisitResult) => void;
}) {
  const results: VisitResult[] = ["CONTACTED", "PROMISE", "PAYMENT", "NO_CONTACT", "REFUSED"];
  return (
    <div className="rounded-lg border-2 border-primary bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        Выезд идёт · {caseCode}
      </div>
      <div className="mt-1 font-display text-lg font-bold">{debtorName}</div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">
        GPS: {visit.lat.toFixed(5)}, {visit.lng.toFixed(5)} · начат {fmtDateTime(visit.startedAt)}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Комментарий к выезду (необязательно)"
        rows={2}
        className="mt-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      />
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {results.map((r) => (
          <button
            key={r}
            onClick={() => onFinish(r)}
            className={
              "rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
              (r === "NO_CONTACT" || r === "REFUSED"
                ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                : "border-success/40 text-success hover:bg-success/10")
            }
          >
            {VISIT_RESULT_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  );
}
