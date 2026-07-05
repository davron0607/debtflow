import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Upload as UploadIcon } from "lucide-react";
import { useStore, type PortfolioRow } from "@/lib/store/store";
import { fmtUSD } from "@/lib/format";

export const Route = createFileRoute("/_app/portfolio/upload")({
  component: PortfolioUpload,
});

const SAMPLE = `pinfl,name,phone,address,amountUSD,collateral,dpd
30101195012345,Отабек Хасанов,+998901234567,г. Ташкент ул. Амира Темура 12,4500,false,15
30202198556781,Зарина Абдуллаева,+998907778899,г. Ташкент пр. Навои 5,12000,true,42
,Санжар Мирзаев,+998901112233,г. Ташкент ул. Мукими 34,2200,false,8
30303197722456,Мохира Тураева,+998907776655,г. Ташкент ул. Богишамол 88,-500,false,22
30303197722456,Мохира Тураева (дубль),+998907776655,г. Ташкент ул. Богишамол 88,7300,false,25
30404199001234,Жасур Исмаилов,+998909991122,г. Ташкент ул. Бабура 3,9800,true,67
30505198812309,Гулнора Каримова,+998907766554,г. Ташкент пр. Мустакиллик 42,3200,false,5`;

type ParsedRow = PortfolioRow & { _row: number; _errors: string[] };

function parseCsv(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: ParsedRow[] = [];
  const seenPinfl = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => (rec[h] = cells[idx] ?? ""));
    const errors: string[] = [];
    if (!rec.pinfl || rec.pinfl.length !== 14 || !/^\d{14}$/.test(rec.pinfl))
      errors.push("ПИНФЛ отсутствует или некорректен (14 цифр)");
    if (rec.pinfl && seenPinfl.has(rec.pinfl)) errors.push("Дубликат ПИНФЛ в файле");
    if (rec.pinfl) seenPinfl.add(rec.pinfl);
    const amt = Number(rec.amountUSD);
    if (!Number.isFinite(amt) || amt <= 0) errors.push("Сумма должна быть положительным числом");
    if (!rec.name) errors.push("Не указано имя");
    const dpd = Number(rec.dpd);
    if (!Number.isFinite(dpd) || dpd < 0) errors.push("Некорректный DPD");
    rows.push({
      _row: i + 1,
      _errors: errors,
      pinfl: rec.pinfl,
      name: rec.name,
      phone: rec.phone,
      address: rec.address,
      amountUSD: Math.max(0, amt || 0),
      collateral: rec.collateral === "true",
      dpd: Math.max(0, dpd || 0),
    });
  }
  return rows;
}

function PortfolioUpload() {
  const { createCasesFromRows, currentUser } = useStore();
  const [text, setText] = useState(SAMPLE);
  const [imported, setImported] = useState<number | null>(null);

  const rows = useMemo(() => parseCsv(text), [text]);
  const valid = rows.filter((r) => r._errors.length === 0);
  const invalid = rows.filter((r) => r._errors.length > 0);
  const totalUSD = valid.reduce((s, r) => s + r.amountUSD, 0);

  if (currentUser.role !== "BANK_ADMIN") {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">
          Загрузка портфеля доступна только Администратору банка.
        </p>
      </div>
    );
  }

  const doImport = () => {
    const n = createCasesFromRows(valid.map(({ _row, _errors, ...r }) => r));
    setImported(n);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Загрузка портфеля</h1>
        <p className="text-sm text-muted-foreground">
          Правильность заполнения как сервис — плохие строки отфильтровываются до создания дел.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <UploadIcon className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider">
              CSV-содержимое (или вставьте из Excel)
            </h2>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="h-80 w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Колонки: <span className="font-mono">pinfl,name,phone,address,amountUSD,collateral,dpd</span>
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider">
              Отчёт валидации
            </h2>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-success/20 px-2 py-0.5 text-success">
                Валидных: {valid.length}
              </span>
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-destructive">
                С ошибками: {invalid.length}
              </span>
            </div>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {rows.map((r) => (
              <div
                key={r._row}
                className={`flex items-start gap-2 rounded border px-2 py-1.5 ${
                  r._errors.length
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-success/40 bg-success/10"
                }`}
              >
                {r._errors.length ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-muted-foreground">
                    строка {r._row} · {r.pinfl || "—"} · {r.name || "—"} · {fmtUSD(r.amountUSD)}
                  </div>
                  {r._errors.length > 0 && (
                    <div className="text-destructive">{r._errors.join(" · ")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Будет создано дел:</span>
              <span className="font-mono font-semibold">{valid.length}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Совокупная сумма:</span>
              <span className="font-mono text-money">{fmtUSD(totalUSD)}</span>
            </div>
          </div>

          <button
            disabled={valid.length === 0}
            onClick={doImport}
            className="mt-4 w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Создать {valid.length} дел
          </button>

          {imported !== null && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              <FileText className="h-4 w-4" />
              Создано {imported} дел со статусом «Новое». Аудит-событие записано.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
