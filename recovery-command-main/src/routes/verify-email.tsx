import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { LogoMark } from "@/components/logo";
import { apiVerifyEmail } from "@/lib/api";

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!token) {
        setState("error");
        setError("Ссылка неполная — перейдите по ссылке из письма.");
        return;
      }
      const res = await apiVerifyEmail({ data: { token } });
      if (!res.ok) {
        setState("error");
        setError(res.error ?? "Ошибка подтверждения");
        return;
      }
      setState("ok");
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      setTimeout(() => navigate({ to: "/control-tower" }), 2000);
    })();
  }, [token, navigate, qc]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <LogoMark size={32} />
          <span className="font-display text-lg font-bold">
            Debt<span style={{ color: "#3E8E41" }}>Flow</span>
          </span>
        </div>
        {state === "pending" && <p className="text-sm text-muted-foreground">Подтверждаем e-mail…</p>}
        {state === "ok" && (
          <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm">
            E-mail подтверждён — доступ активирован. Входим…
          </div>
        )}
        {state === "error" && (
          <div>
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
            <Link to="/login" className="mt-4 block text-xs text-primary hover:underline">
              ← Ко входу
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
