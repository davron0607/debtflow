import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus, Pencil, X, Check } from "lucide-react";
import { useStore } from "@/lib/store/store";
import { ORG_ROLES, ROLE_LABEL, type User, type UserRole } from "@/lib/store/types";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

function UsersPage() {
  const { db, currentUser, canManageUsers, manageableUsers, addUser, updateUser } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  if (!canManageUsers()) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="font-display text-3xl font-bold">Пользователи и роли</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Доступ к управлению пользователями есть только у администратора банка и менеджера организации.
        </p>
      </div>
    );
  }

  const isBankAdmin = currentUser.role === "BANK_ADMIN";
  const users = manageableUsers();
  const manageableOrgs = isBankAdmin
    ? db.orgs
    : db.orgs.filter((o) => o.id === currentUser.orgId);

  const flash = (kind: "ok" | "err", text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Пользователи и роли</h1>
          <p className="text-sm text-muted-foreground">
            {isBankAdmin
              ? "Как администратор банка вы управляете учётными записями всех подключённых организаций."
              : "Как менеджер вы управляете учётными записями своей организации."}
          </p>
        </div>
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setEditingId(null);
          }}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" /> Новый пользователь
        </button>
      </div>

      {notice && (
        <div
          className={
            "mb-4 rounded-md border px-3 py-2 text-sm " +
            (notice.kind === "ok"
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive")
          }
        >
          {notice.text}
        </div>
      )}

      {showAdd && (
        <UserForm
          orgs={manageableOrgs.map((o) => ({ id: o.id, name: o.name, roles: ORG_ROLES[o.type] }))}
          onCancel={() => setShowAdd(false)}
          onSubmit={(v) => {
            const res = addUser(v);
            if (res.ok) {
              setShowAdd(false);
              flash("ok", `Пользователь ${v.name} создан. Пароль для демо-входа: demo123.`);
            } else flash("err", res.error!);
          }}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Пользователь</th>
              <th className="p-3 text-left">E-mail</th>
              <th className="p-3 text-left">Организация</th>
              <th className="p-3 text-left">Роль</th>
              <th className="p-3 text-left">ЭЦП (операционная)</th>
              <th className="p-3 text-left">Статус</th>
              <th className="p-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) =>
              editingId === u.id ? (
                <EditRow
                  key={u.id}
                  user={u}
                  roles={ORG_ROLES[db.orgs.find((o) => o.id === u.orgId)?.type ?? "COLLECTOR"]}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => {
                    const res = updateUser(u.id, patch);
                    if (res.ok) {
                      setEditingId(null);
                      flash("ok", "Изменения сохранены.");
                    } else flash("err", res.error!);
                  }}
                />
              ) : (
                <tr key={u.id} className="border-t border-border/50 hover:bg-surface-2">
                  <td className="p-3 font-medium">
                    {u.name}
                    {u.id === currentUser.id && (
                      <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">вы</span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">{u.email}</td>
                  <td className="p-3">{db.orgs.find((o) => o.id === u.orgId)?.name ?? "—"}</td>
                  <td className="p-3">{ROLE_LABEL[u.role]}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{u.edsOperational ?? "—"}</td>
                  <td className="p-3">
                    {u.active === false ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">отключён</span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">активен</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingId(u.id);
                          setShowAdd(false);
                        }}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      >
                        <Pencil className="h-3 w-3" /> Изменить
                      </button>
                      <button
                        onClick={() => {
                          const res = updateUser(u.id, { active: u.active === false });
                          if (res.ok)
                            flash("ok", u.active === false ? "Доступ восстановлен." : "Доступ отключён.");
                          else flash("err", res.error!);
                        }}
                        className={
                          "rounded-md border px-2 py-1 text-xs " +
                          (u.active === false
                            ? "border-success/40 text-success hover:bg-success/10"
                            : "border-destructive/40 text-destructive hover:bg-destructive/10")
                        }
                      >
                        {u.active === false ? "Включить" : "Отключить"}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Институциональная идентичность: дела принадлежат организации, а не подписи сотрудника. Отключение
        пользователя не влияет на историю дел и метрики — ЭЦП является съёмным операционным атрибутом.
      </p>
    </div>
  );
}

function UserForm({
  orgs,
  onSubmit,
  onCancel,
}: {
  orgs: { id: string; name: string; roles: UserRole[] }[];
  onSubmit: (v: { orgId: string; name: string; email: string; role: UserRole }) => void;
  onCancel: () => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
  const [role, setRole] = useState<UserRole>(org?.roles[0] ?? "COLLECTOR");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const roles = org?.roles ?? [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ orgId, name, email, role: roles.includes(role) ? role : roles[0] });
      }}
      className="mb-6 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div className="lg:col-span-1">
        <label className="mb-1 block text-xs uppercase text-muted-foreground">ФИО</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs uppercase text-muted-foreground">E-mail</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs uppercase text-muted-foreground">Организация</label>
        <select
          value={orgId}
          onChange={(e) => {
            setOrgId(e.target.value);
            const next = orgs.find((o) => o.id === e.target.value);
            if (next && !next.roles.includes(role)) setRole(next.roles[0]);
          }}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs uppercase text-muted-foreground">Роль</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Check className="h-4 w-4" /> Создать
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <X className="h-4 w-4" /> Отмена
        </button>
      </div>
    </form>
  );
}

function EditRow({
  user,
  roles,
  onSave,
  onCancel,
}: {
  user: User;
  roles: UserRole[];
  onSave: (patch: Partial<Pick<User, "name" | "email" | "role">>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);

  return (
    <tr className="border-t border-border/50 bg-accent/40">
      <td className="p-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </td>
      <td className="p-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
      </td>
      <td className="p-2 text-sm text-muted-foreground">не переносится</td>
      <td className="p-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          {(roles.includes(user.role) ? roles : [user.role, ...roles]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 font-mono text-xs text-muted-foreground">{user.edsOperational ?? "—"}</td>
      <td className="p-2" />
      <td className="p-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onSave({ name, email, role })}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Check className="h-3 w-3" /> Сохранить
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          >
            <X className="h-3 w-3" /> Отмена
          </button>
        </div>
      </td>
    </tr>
  );
}
