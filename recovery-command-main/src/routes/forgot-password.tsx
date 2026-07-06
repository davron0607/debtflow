import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { apiRequestPasswordReset } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await apiRequestPasswordReset({ data: { email } });
    setBusy(false);
    setSent(true);
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
        <h1 className="font-display text-xl font-bold">Сброс пароля</h1>
        {sent ? (
          <div className="mt-4 rounded-md border border-success/30 bg-success/10 p-4 text-sm">
            Если такой адрес зарегистрирован, мы отправили на него ссылку для сброса пароля.
            Ссылка действует 1 час.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Укажите e-mail вашей учётной записи — пришлём ссылку для смены пароля.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.uz"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" /> {busy ? "Отправка..." : "Отправить ссылку"}
            </button>
          </form>
        )}
        <Link to="/login" className="mt-4 block text-center text-xs text-primary hover:underline">
          ← Вернуться ко входу
        </Link>
      </div>
    </div>
  );
}
