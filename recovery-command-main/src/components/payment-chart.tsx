// График возврата денег по делу: накопительная линия оплат к сумме долга
// + точки обещаний (жёлтые — в срок, красные — просроченные/нарушенные).
import {
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { Case, Payment } from "@/lib/store/types";
import { fmtUSD, fmtDate } from "@/lib/format";

export function PaymentChart({ c, payments }: { c: Case; payments: Payment[] }) {
  const paid = payments
    .filter((p) => p.paidAt)
    .sort((a, b) => (a.paidAt! < b.paidAt! ? -1 : 1));
  const promises = payments.filter((p) => p.kind === "PROMISE" && p.promisedDate);

  if (paid.length === 0 && promises.length === 0) return null;

  // Накопительная серия оплат: старт от возникновения просрочки
  let cum = 0;
  const paidSeries = [
    { t: new Date(c.originatedAt).getTime(), paid: 0 },
    ...paid.map((p) => {
      cum += p.amountUSD;
      return { t: new Date(p.paidAt!).getTime(), paid: cum };
    }),
    { t: Date.now(), paid: cum },
  ];

  const promisePoints = promises.map((p) => {
    const overdue = new Date(p.promisedDate!) < new Date() && !p.paidAt;
    return { t: new Date(p.promisedDate!).getTime(), promise: p.amountUSD, overdue };
  });

  const data = [...paidSeries, ...promisePoints.map((p) => ({ t: p.t, promise: p.promise }))].sort(
    (a, b) => a.t - b.t,
  );

  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase text-muted-foreground">Динамика возврата</span>
        <span className="font-mono">
          <span className="text-success">{fmtUSD(cum)}</span>
          <span className="text-muted-foreground"> из {fmtUSD(c.amountUSD)} ({Math.round((cum / c.amountUSD) * 100)}%)</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => fmtDate(new Date(t).toISOString())}
            tick={{ fontSize: 10 }}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
            tick={{ fontSize: 10 }}
            width={42}
            stroke="var(--muted-foreground)"
            domain={[0, Math.max(c.amountUSD, cum) * 1.05]}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              fmtUSD(value),
              name === "paid" ? "Оплачено (накопительно)" : "Обещание оплаты",
            ]}
            labelFormatter={(t) => fmtDate(new Date(Number(t)).toISOString())}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          {/* Сумма долга — целевая линия */}
          <ReferenceLine
            y={c.amountUSD}
            stroke="var(--money)"
            strokeDasharray="4 4"
            label={{ value: `долг ${fmtUSD(c.amountUSD)}`, fontSize: 10, fill: "var(--money)", position: "insideTopRight" }}
          />
          <Area
            dataKey="paid"
            type="stepAfter"
            stroke="var(--success)"
            fill="var(--success)"
            fillOpacity={0.15}
            strokeWidth={2}
            connectNulls
            dot={{ r: 3 }}
          />
          <Scatter dataKey="promise" fill="var(--money)" shape={(props: { cx?: number; cy?: number; payload?: { t: number } }) => {
            const overdue = promisePoints.find((p) => p.t === props.payload?.t)?.overdue;
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={5}
                fill={overdue ? "var(--destructive)" : "var(--money)"}
                stroke="white"
                strokeWidth={1.5}
              />
            );
          }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />оплаты (накопительно)</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-money" />обещание</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive" />обещание просрочено</span>
        <span><span className="mr-1 inline-block h-2 w-3 border-t-2 border-dashed border-money align-middle" />сумма долга</span>
      </div>
    </div>
  );
}
