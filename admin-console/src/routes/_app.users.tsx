import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Lock, Unlock, LogOut as LogOutIcon, Search } from "lucide-react";
import { apiForceLogoutUser, apiResetUserPassword, apiSetUserActive, apiUserList } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  orgId: string;
  orgName: string;
  lastSessionAt: string | null;
  activeSessionCount: number;
};

function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmBlockFor, setConfirmBlockFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => setUsers((await apiUserList()) as UserRow[]), []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.orgName.toLowerCase().includes(q),
    );
  }, [users, query]);

  const resetPassword = async (u: UserRow) => {
    if (!confirm(`Сбросить пароль для ${u.email}? Пользователю уйдёт письмо с временным паролем, текущие сеансы завершатся.`)) return;
    setBusyId(u.id);
    const res = await apiResetUserPassword({ data: { userId: u.id } });
    setBusyId(null);
    flash(res.ok ? `Пароль сброшен, письмо отправлено на ${u.email}.` : res.error ?? "Ошибка");
    if (res.ok) await reload();
  };

  const setActive = async (u: UserRow, active: boolean) => {
    setBusyId(u.id);
    const res = await apiSetUserActive({ data: { userId: u.id, active } });
    setBusyId(null);
    setConfirmBlockFor(null);
    flash(res.ok ? (active ? "Учётная запись разблокирована." : "Учётная запись заблокирована, сессии завершены.") : res.error ?? "Ошибка");
    if (res.ok) await reload();
  };

  const forceLogout = async (u: UserRow) => {
    setBusyId(u.id);
    const res = await apiForceLogoutUser({ data: { userId: u.id } });
    setBusyId(null);
    flash(res.ok ? `Завершено сеансов: ${res.count}.` : res.error ?? "Ошибка");
    if (res.ok) await reload();
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">Пользователи</h1>
        <p className="text-sm text-muted-foreground">
          Саппорт учётных записей сотрудников банков и агентств: сброс пароля, блокировка, завершение сеансов. Дела и документы оператору не видны.
        </p>
      </div>

      {notice && <div className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">{notice}</div>}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени, e-mail или организации"
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Пользователь</th>
              <th className="p-3 text-left">Организация</th>
              <th className="p-3 text-left">Роль</th>
              <th className="p-3 text-left">Статус</th>
              <th className="p-3 text-left">Последний вход</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-t border-border/50 hover:bg-surface-2">
                <td className="p-3">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="p-3 text-xs">{u.orgName}</td>
                <td className="p-3 text-xs text-muted-foreground">{u.role}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${u.active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {u.active ? "активен" : "заблокирован"}
                  </span>
                  {u.activeSessionCount > 0 && (
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">· {u.activeSessionCount} сеанс.</span>
                  )}
                </td>
                <td className="p-3 text-xs text-muted-foreground">{u.lastSessionAt ? fmtDateTime(u.lastSessionAt) : "—"}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      disabled={busyId === u.id}
                      onClick={() => resetPassword(u)}
                      title="Сбросить пароль"
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                    >
                      <KeyRound className="h-3 w-3" /> Сброс пароля
                    </button>
                    <button
                      disabled={busyId === u.id || u.activeSessionCount === 0}
                      onClick={() => forceLogout(u)}
                      title="Завершить все сеансы"
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                    >
                      <LogOutIcon className="h-3 w-3" /> Разлогинить
                    </button>
                    {u.active ? (
                      confirmBlockFor === u.id ? (
                        <button
                          disabled={busyId === u.id}
                          onClick={() => setActive(u, false)}
                          className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-40"
                        >
                          Подтвердить блокировку
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmBlockFor(u.id)}
                          className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Lock className="h-3 w-3" /> Заблокировать
                        </button>
                      )
                    ) : (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => setActive(u, true)}
                        className="flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-xs text-success hover:bg-success/10 disabled:opacity-40"
                      >
                        <Unlock className="h-3 w-3" /> Разблокировать
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users !== null && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">{query ? "Ничего не найдено." : "Пользователей пока нет."}</div>
        )}
      </div>
    </div>
  );
}
