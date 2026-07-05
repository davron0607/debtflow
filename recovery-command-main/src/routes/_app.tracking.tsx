import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { VISIT_RESULT_LABEL, type FieldVisit } from "@/lib/store/types";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/tracking")({
  component: TrackingPage,
});

function TrackingPage() {
  const { db, currentUser, scopedVisits } = useStore();
  const [selectedCollector, setSelectedCollector] = useState<string | "ALL">("ALL");

  const allowed = ["BANK_ADMIN", "BANK_LEGAL", "MANAGER"].includes(currentUser.role);
  if (!allowed) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="font-display text-3xl font-bold">GPS-мониторинг</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Доступно администратору банка, юристу банка и менеджеру агентства.
        </p>
      </div>
    );
  }

  const visits = scopedVisits();
  const collectorIds = Array.from(new Set(visits.map((v) => v.collectorUserId)));
  const shown = selectedCollector === "ALL" ? visits : visits.filter((v) => v.collectorUserId === selectedCollector);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">GPS-мониторинг выездов</h1>
        <p className="text-sm text-muted-foreground">
          Контроль полевых коллекторов: маршруты, результаты выездов и эффективность.
          {currentUser.role === "MANAGER" ? " Видны только коллекторы вашей организации." : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Map */}
        <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Карта выездов · Ташкент (демо-подложка)</div>
            <select
              value={selectedCollector}
              onChange={(e) => setSelectedCollector(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="ALL">Все коллекторы</option>
              {collectorIds.map((cid) => (
                <option key={cid} value={cid}>
                  {db.users.find((u) => u.id === cid)?.name ?? cid}
                </option>
              ))}
            </select>
          </div>
          <VisitsMap visits={shown} />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />контакт / оплата / обещание</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive" />нет на месте / отказ</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />выезд в процессе</span>
          </div>
        </div>

        {/* Efficiency */}
        <div className="lg:col-span-2">
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Коллектор</th>
                  <th className="p-2 text-right">Выездов</th>
                  <th className="p-2 text-right">Контакт %</th>
                  <th className="p-2 text-right">Результат</th>
                  <th className="p-2 text-left">Последний GPS</th>
                </tr>
              </thead>
              <tbody>
                {collectorIds.map((cid) => {
                  const u = db.users.find((x) => x.id === cid);
                  const mine = visits.filter((v) => v.collectorUserId === cid);
                  const doneVisits = mine.filter((v) => v.result);
                  const contact = doneVisits.filter((v) => v.result !== "NO_CONTACT").length;
                  const success = doneVisits.filter((v) => v.result === "PROMISE" || v.result === "PAYMENT").length;
                  const last = mine.slice().sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
                  const contactRate = doneVisits.length ? Math.round((contact / doneVisits.length) * 100) : 0;
                  return (
                    <tr key={cid} className="border-t border-border/50">
                      <td className="p-2 font-medium">
                        {u?.name}
                        <div className="text-[10px] text-muted-foreground">
                          {db.orgs.find((o) => o.id === u?.orgId)?.name}
                        </div>
                      </td>
                      <td className="p-2 text-right font-mono">{mine.length}</td>
                      <td className={"p-2 text-right font-mono " + (contactRate >= 60 ? "text-success" : "text-destructive")}>
                        {contactRate}%
                      </td>
                      <td className="p-2 text-right font-mono">{success} 💰</td>
                      <td className="p-2 font-mono text-[10px] text-muted-foreground">
                        {last ? `${last.lat.toFixed(3)}, ${last.lng.toFixed(3)}` : "—"}
                        <div>{last ? fmtDateTime(last.startedAt) : ""}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
            {shown
              .slice()
              .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
              .map((v) => {
                const c = db.cases.find((x) => x.id === v.caseId);
                const u = db.users.find((x) => x.id === v.collectorUserId);
                const bad = v.result === "NO_CONTACT" || v.result === "REFUSED";
                return (
                  <div key={v.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <MapPin className={"h-3.5 w-3.5 " + (v.result ? (bad ? "text-destructive" : "text-success") : "text-primary")} />
                      <div>
                        {c && (
                          <Link to="/cases/$id" params={{ id: c.id }} className="font-mono text-primary hover:underline">
                            {c.code}
                          </Link>
                        )}
                        <span className="ml-2 text-muted-foreground">{u?.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div>{v.result ? VISIT_RESULT_LABEL[v.result] : "в процессе"}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtDateTime(v.startedAt)}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        V2: живой трек в течение дня через мобильное приложение (фоновая геолокация), геозоны по адресам
        должников и автоматическое подтверждение факта визита.
      </p>
    </div>
  );
}

function VisitsMap({ visits }: { visits: FieldVisit[] }) {
  // Normalized plot over Tashkent bounding box; stylized grid instead of real tiles (V1, on-prem friendly)
  const B = { minLat: 41.24, maxLat: 41.38, minLng: 69.19, maxLng: 69.37 };
  const W = 640;
  const H = 400;
  const px = (v: FieldVisit) => ({
    x: ((v.lng - B.minLng) / (B.maxLng - B.minLng)) * W,
    y: H - ((v.lat - B.minLat) / (B.maxLat - B.minLat)) * H,
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-md border border-border bg-mist">
      {/* grid */}
      {Array.from({ length: 15 }, (_, i) => (
        <line key={`v${i}`} x1={(i * W) / 15} y1={0} x2={(i * W) / 15} y2={H} stroke="var(--border)" strokeWidth="0.5" />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(i * H) / 10} x2={W} y2={(i * H) / 10} stroke="var(--border)" strokeWidth="0.5" />
      ))}
      {/* stylized river/road hints */}
      <path d={`M 0 ${H * 0.7} C ${W * 0.3} ${H * 0.55}, ${W * 0.6} ${H * 0.8}, ${W} ${H * 0.6}`} fill="none" stroke="var(--primary)" strokeOpacity="0.15" strokeWidth="10" />
      <path d={`M ${W * 0.5} 0 L ${W * 0.45} ${H}`} fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.15" strokeWidth="6" />
      {visits.map((v) => {
        const { x, y } = px(v);
        const bad = v.result === "NO_CONTACT" || v.result === "REFUSED";
        const fill = v.result ? (bad ? "var(--destructive)" : "var(--success)") : "var(--primary)";
        return (
          <g key={v.id}>
            <circle cx={x} cy={y} r={7} fill={fill} opacity={0.2} />
            <circle cx={x} cy={y} r={3.5} fill={fill} />
          </g>
        );
      })}
      <text x={10} y={H - 10} fontSize="10" fill="var(--muted-foreground)">
        {visits.length} точек GPS
      </text>
    </svg>
  );
}
