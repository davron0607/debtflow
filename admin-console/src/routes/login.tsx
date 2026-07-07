import { createFileRoute, Navigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn, ShieldAlert } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, isAuthenticated } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/orgs" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Ошибка входа");
    router.navigate({ to: "/orgs" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark size={32} />
          <div className="leading-tight">
            <div className="font-display text-lg font-bold">
              Debt<span style={{ color: "#3E8E41" }}>Flow</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Консоль оператора</div>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-md border border-money/30 bg-money/10 p-3 text-xs text-money">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Отдельное приложение для операторов платформы. Учётные записи банков и агентств здесь не действуют.</span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@debtflow.uz"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" /> {busy ? "Вход..." : "Войти"}
          </button>
        </form>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Смена пароля — через CLI-скрипт с полным доступом к БД, не через веб-форму.
        </p>
      </div>
    </div>
  );
}
