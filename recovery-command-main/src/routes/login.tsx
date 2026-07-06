import { createFileRoute, Navigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useStore, DEMO_PASSWORD } from "@/lib/store/store";
import { ROLE_LABEL } from "@/lib/store/types";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { db, login, isAuthenticated } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/control-tower" />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok) {
      setError(res.error ?? "Ошибка входа");
      return;
    }
    router.navigate({ to: "/control-tower" });
  };

  const demoUsers = db.users.filter((u) => u.active !== false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:grid lg:grid-cols-5">
        {/* Brand panel */}
        <div className="bg-sidebar p-8 text-sidebar-foreground lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-white p-1.5">
              <LogoMark size={36} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg font-bold">
                Debt<span style={{ color: "#8CC63F" }}>Flow</span>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
                debtflow.uz
              </div>
            </div>
          </div>
          <h1 className="mt-8 font-display text-2xl font-bold">
            Единая операционная система взыскания
          </h1>
          <p className="mt-3 text-sm text-sidebar-foreground/70">
            Нейтральный слой координации между банком, коллекторами, юридическими фирмами и МИБ.
            Принуждение — только МИБ.
          </p>
          <div className="mt-8 space-y-2 text-xs text-sidebar-foreground/60">
            <div>· Портфель → Назначение → Взыскание</div>
            <div>· Суд и МИБ — ручное ведение (V1)</div>
            <div>· Неизменяемый аудит каждого действия</div>
          </div>
        </div>

        {/* Login form */}
        <div className="p-8 lg:col-span-3">
          <h2 className="font-display text-xl font-bold">Вход в систему</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Доступ определяется ролью вашей учётной записи (RBAC).
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tengebank.uz"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <LogIn className="h-4 w-4" /> Войти
            </button>
          </form>

          <div className="mt-8">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Демо-доступ (пароль у всех: <span className="font-mono">{DEMO_PASSWORD}</span>)
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {demoUsers.map((u) => {
                const org = db.orgs.find((o) => o.id === u.orgId);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword(DEMO_PASSWORD);
                      setError(null);
                    }}
                    className="rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary hover:bg-accent"
                  >
                    <div className="font-medium">{ROLE_LABEL[u.role]}</div>
                    <div className="text-muted-foreground">
                      {u.name} · {org?.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
