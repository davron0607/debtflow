import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
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
        <h1 className="font-display text-3xl font-bold">Эффективность коллекторов</h1>
        <p className="text-sm text-muted-foreground">
          Продуктивность полевой работы: выезды, контактность, результат. GPS — вспомогательный контроль.
          {currentUser.role === "MANAGER" ? " Видны только коллекторы вашей организации." : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Map */}
        <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Карта выездов · OpenStreetMap</div>
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
          <VisitsMap
            visits={shown}
            caseCodeById={(id) => db.cases.find((x) => x.id === id)?.code ?? ""}
            collectorNameById={(id) => db.users.find((x) => x.id === id)?.name ?? ""}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />контакт / оплата / обещание</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive" />нет на месте / отказ</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />выезд в процессе</span>
            <span><span className="mr-1 inline-block h-2 w-0.5 align-middle" style={{ borderLeft: "2px dashed #64748b", height: 10, display: "inline-block" }} />маршрут коллектора (по времени)</span>
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

// Реальная карта: Leaflet + OpenStreetMap (open source).
// Точки — выезды (цвет по результату), пунктирные линии — маршрут коллектора
// в хронологическом порядке. Импорт Leaflet — динамический (SSR-safe).
const ROUTE_COLORS = ["#2563eb", "#9333ea", "#0d9488", "#c2410c"];

function VisitsMap({
  visits,
  caseCodeById,
  collectorNameById,
}: {
  visits: FieldVisit[];
  caseCodeById: (caseId: string) => string;
  collectorNameById: (userId: string) => string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(divRef.current).setView([41.311, 69.28], 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const layer = layerRef.current!;
      layer.clearLayers();

      // Маршруты: точки каждого коллектора по времени
      const byCollector = new Map<string, FieldVisit[]>();
      visits.forEach((v) => {
        const arr = byCollector.get(v.collectorUserId) ?? [];
        arr.push(v);
        byCollector.set(v.collectorUserId, arr);
      });
      let ci = 0;
      byCollector.forEach((arr, uid) => {
        const sorted = arr.slice().sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
        if (sorted.length > 1) {
          L.polyline(
            sorted.map((v) => [v.lat, v.lng] as [number, number]),
            { color: ROUTE_COLORS[ci % ROUTE_COLORS.length], weight: 2, dashArray: "6 6", opacity: 0.7 },
          )
            .bindTooltip(`Маршрут: ${collectorNameById(uid)}`)
            .addTo(layer);
        }
        ci++;
      });

      // Точки выездов
      visits.forEach((v) => {
        const bad = v.result === "NO_CONTACT" || v.result === "REFUSED";
        const color = v.result ? (bad ? "#dc2626" : "#16a34a") : "#2563eb";
        L.circleMarker([v.lat, v.lng], {
          radius: 7,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.35,
        })
          .bindPopup(
            `<b>${caseCodeById(v.caseId)}</b><br/>${collectorNameById(v.collectorUserId)}<br/>` +
              `${new Date(v.startedAt).toLocaleString("ru-RU")}<br/>` +
              `${v.result ? VISIT_RESULT_LABEL[v.result] : "в процессе"}`,
          )
          .addTo(layer);
      });

      if (visits.length > 0) {
        mapRef.current!.fitBounds(
          L.latLngBounds(visits.map((v) => [v.lat, v.lng] as [number, number])).pad(0.2),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visits, caseCodeById, collectorNameById]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return <div ref={divRef} className="h-[420px] w-full rounded-md border border-border" />;
}
