import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, UserPlus } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { apiRegister } from "@/lib/api";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

type RegOrgType = "COLLECTOR" | "LEGAL_FIRM" | "BANK" | "MFO";

function RegisterPage() {
  const [orgType, setOrgType] = useState<RegOrgType>("COLLECTOR");
  const [orgDomain, setOrgDomain] = useState("");
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const isFinancial = orgType === "BANK" || orgType === "MFO";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Минимальная длина пароля — 8 символов");
    setBusy(true);
    const res = await apiRegister({
      data: { orgType, orgName, name, email, password, orgDomain: orgDomain || undefined },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Ошибка регистрации");
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-8 shadow-sm">
        <Link to="/" className="mb-6 flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <LogoMark size={32} />
          <span className="font-display text-lg font-bold">
            Debt<span style={{ color: "#3E8E41" }}>Flow</span>
          </span>
        </Link>

        {sent ? (
          <div>
            <h1 className="font-display text-xl font-bold">Проверьте почту</h1>
            <div className="mt-4 rounded-md border border-success/30 bg-success/10 p-4 text-sm">
              Мы отправили письмо на <b>{email}</b>. Перейдите по ссылке из письма, чтобы
              подтвердить e-mail. Ссылка действует 24 часа.
              {isFinancial &&
                " После подтверждения заявка банка/МФО уходит на проверку оператору платформы — о решении сообщим письмом."}
            </div>
            <Link to="/login" className="mt-4 block text-center text-xs text-primary hover:underline">
              ← Ко входу
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-xl font-bold">Регистрация организации</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Банки и МФО получают собственный портфель; агентства и юр. фирмы работают с делами,
              которые им назначают банки.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Тип организации
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "COLLECTOR", label: "Коллекторское агентство" },
                      { v: "LEGAL_FIRM", label: "Юридическая фирма" },
                      { v: "BANK", label: "Банк" },
                      { v: "MFO", label: "МФО" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setOrgType(o.v)}
                      className={
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                        (orgType === o.v
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-primary/50")
                      }
                    >
                      <Building2 className="h-4 w-4 shrink-0" /> {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {isFinancial && (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Официальный домен организации
                  </label>
                  <input
                    required
                    value={orgDomain}
                    onChange={(e) => setOrgDomain(e.target.value)}
                    placeholder="yourbank.uz"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Антифрод-проверка: e-mail администратора должен быть на этом домене, публичные
                    почтовые сервисы не принимаются, у домена проверяется почтовая инфраструктура
                    (MX). Так мы убеждаемся, что заявку подаёт сама организация.
                  </p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Название организации
                </label>
                <input
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder={
                    orgType === "BANK"
                      ? "АКБ «Пример Банк»"
                      : orgType === "MFO"
                        ? 'МФО "Пример Кредит"'
                        : orgType === "LEGAL_FIRM"
                          ? 'ЮФ "Пример и партнёры"'
                          : 'КА "Взыскание Плюс"'
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Ваше ФИО
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Рабочий e-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Пароль (мин. 8)
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                </div>
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
                <UserPlus className="h-4 w-4" /> {busy ? "Создание..." : "Зарегистрироваться"}
              </button>
              <Link to="/login" className="block text-center text-xs text-primary hover:underline">
                Уже есть аккаунт? Войти
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
