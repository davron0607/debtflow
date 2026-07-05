import { createFileRoute } from "@tanstack/react-router";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/_app/mib")({
  component: MibStub,
});

function MibStub() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Запланировано (V2)</div>
        <h1 className="font-display text-3xl font-bold">МИБ · Бюро принудительного исполнения</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Только МИБ (БПИ) осуществляет принуждение: удержания с зарплаты, ограничения на имущество,
          запрет выезда, взыскание. Приватные участники платформы принуждать не могут — они лишь
          <b> регистрируют запросы</b> и <b>отслеживают</b> статусы. В V2 — синхронизация статусов
          через <span className="font-mono text-primary">IntegrationAdapter → MIB/БПИ</span>.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 opacity-60">
        {["Исполнитель назначен", "Добровольный период", "Удержание с зарплаты", "Ограничение имущества"].map((s) => (
          <div key={s} className="rounded-lg border border-dashed border-border bg-surface p-4">
            <Radio className="mb-2 h-4 w-4 text-primary" />
            <div className="text-sm font-medium">{s}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">V2</div>
          </div>
        ))}
      </div>
    </div>
  );
}
