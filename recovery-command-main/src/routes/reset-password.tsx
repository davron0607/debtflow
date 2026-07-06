import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { z } from "zod";
import { LogoMark } from "@/components/logo";
import { apiResetPassword } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Минимальная длина пароля — 8 символов");
    if (password !== confirm) return setError("Пароли не совпадают");
    const res = await apiResetPassword({ data: { token: token ?? "", password } });
    if (!res.ok) return setError(res.error ?? "Ошибка");
    setDone(true);
    setTimeout(() => navigate({ to: "/login" }), 2500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="font-display text-lg font-bold">
            Debt<span style={{ color: "#3E8E41" }}>Flow</span>
          </span>
        </div>
        <h1 className="font-display text-xl font-bold">Новый пароль</h1>
        {!token ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Ссылка неполная — перейдите по ссылке из письма или{" "}
            <Link to="/forgot-password" className="text-primary hover:underline">
              запросите новую
            </Link>
            .
          </p>
        ) : done ? (
          <div className="mt-4 rounded-md border border-success/30 bg-success/10 p-4 text-sm">
            Пароль обновлён. Все прежние сессии завершены. Перенаправляем на вход…
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Новый пароль (мин. 8 символов)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Повторите пароль"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <KeyRound className="h-4 w-4" /> Сохранить пароль
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
