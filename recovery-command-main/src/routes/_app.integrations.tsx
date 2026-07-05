import { createFileRoute } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { integrationsCatalog } from "@/lib/integrations/adapter";

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsStub,
});

function IntegrationsStub() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Запланировано (V2)</div>
        <h1 className="font-display text-3xl font-bold">Интеграции</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          V1 использует моки. Реальные адаптеры E-SUD, Нотариус, МИБ/БПИ, Кадастр, ABS и E-IMZO
          подключатся через единый интерфейс <span className="font-mono text-primary">IntegrationAdapter</span> —
          код над адаптером не изменится.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {integrationsCatalog.map((it) => (
          <div key={it.key} className="rounded-lg border border-dashed border-border bg-surface p-5 opacity-70">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-primary" />
                <div className="font-display font-semibold">{it.label}</div>
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase">V2</span>
            </div>
            <p className="text-xs text-muted-foreground">{it.desc}</p>
            <button disabled className="mt-3 w-full cursor-not-allowed rounded bg-surface-2 py-1.5 text-xs text-muted-foreground">
              Подключить (недоступно в V1)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
