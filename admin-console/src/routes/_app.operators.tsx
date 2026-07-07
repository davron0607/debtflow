import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Eye, Lock, ShieldCheck, Unlock, UserPlus } from "lucide-react";
import { apiInviteOperator, apiOperatorList, apiSetOperatorActive, apiSetOperatorLevel } from "@/lib/api";
import { useStore } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/operators")({
  component: OperatorsPage,
});

type OperatorRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  level: "FULL" | "READ_ONLY";
  lastSessionAt: string | null;
  createdAt: string;
};

function OperatorsPage() {
  const { email: myEmail, isReadOnly } = useStore();
  const [ops, setOps] = useState<OperatorRow[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"FULL" | "READ_ONLY">("READ_ONLY");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setOps((await apiOperatorList()) as OperatorRow[]), []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  const invite = async () => {
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    const res = await apiInviteOperator({ data: { name: name.trim(), email: email.trim(), level } });
    setBusy(false);
    flash(res.ok ? `Приглашение отправлено на ${email}.` : res.error ?? "Ошибка");
    if (res.ok) {
      setName("");
      setEmail("");
      setLevel("READ_ONLY");
      setShowInvite(false);
      await reload();
    }
  };

  const setLevelFor = async (op: OperatorRow, newLevel: "FULL" | "READ_ONLY") => {
    const res = await apiSetOperatorLevel({ data: { userId: op.id, level: newLevel } });
    flash(res.ok ? "Уровень доступа изменён." : res.error ?? "Ошибка");
    if (res.ok) await reload();
  };

  const setActive = async (op: OperatorRow, active: boolean) => {
    if (!active && !confirm(`Деактивировать оператора ${op.email}?`)) return;
    const res = await apiSetOperatorActive({ data: { userId: op.id, active } });
    flash(res.ok ? (active ? "Оператор восстановлен." : "Оператор деактивирован.") : res.error ?? "Ошибка");
    if (res.ok) await reload();
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Операторы платформы</h1>
          <p className="text-sm text-muted-foreground">
            Команда, имеющая доступ к этой консоли. FULL — может проводить действия, READ_ONLY — только просмотр.
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="h-3.5 w-3.5" /> Пригласить оператора
          </button>
        )}
      </div>

      {notice && <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">{notice}</div>}

      {showInvite && (
        <div className="mb-5 rounded-lg border border-border bg-surface p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              type="email"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as "FULL" | "READ_ONLY")}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="READ_ONLY">Только просмотр</option>
              <option value="FULL">Полный доступ</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy || !name.trim() || !email.trim()}
              onClick={invite}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Отправить приглашение
            </button>
            <button onClick={() => setShowInvite(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Оператор</th>
              <th className="p-3 text-left">Уровень доступа</th>
              <th className="p-3 text-left">Статус</th>
              <th className="p-3 text-left">Последний вход</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {(ops ?? []).map((op) => {
              const isMe = op.email === myEmail;
              return (
                <tr key={op.id} className="border-t border-border/50 hover:bg-surface-2">
                  <td className="p-3">
                    <div className="font-medium">
                      {op.name} {isMe && <span className="text-xs text-muted-foreground">(вы)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{op.email}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        op.level === "FULL" ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {op.level === "FULL" ? <ShieldCheck className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {op.level === "FULL" ? "Полный доступ" : "Только просмотр"}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${op.active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {op.active ? "активен" : "деактивирован"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{op.lastSessionAt ? fmtDateTime(op.lastSessionAt) : "—"}</td>
                  <td className="p-3">
                    {!isReadOnly && !isMe && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setLevelFor(op, op.level === "FULL" ? "READ_ONLY" : "FULL")}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                        >
                          {op.level === "FULL" ? "Сделать read-only" : "Дать полный доступ"}
                        </button>
                        {op.active ? (
                          <button
                            onClick={() => setActive(op, false)}
                            className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          >
                            <Lock className="h-3 w-3" /> Деактивировать
                          </button>
                        ) : (
                          <button
                            onClick={() => setActive(op, true)}
                            className="flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-xs text-success hover:bg-success/10"
                          >
                            <Unlock className="h-3 w-3" /> Восстановить
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ops !== null && ops.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Операторов пока нет.</div>}
      </div>
    </div>
  );
}
