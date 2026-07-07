// Клиентский стор консоли оператора: минимальный — только auth-статус.
// Данные страниц (заявки/организации/аудит) грузятся напрямую через
// React Query в каждом роуте (см. routes/_app.*.tsx).
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiLogin, apiLogout, apiWhoAmI } from "./api";

interface StoreCtx {
  isAuthenticated: boolean;
  name: string;
  email: string;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["whoami"], queryFn: () => apiWhoAmI(), staleTime: 5_000 });

  const invalidate = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["whoami"] });
  }, [qc]);

  const value: StoreCtx = {
    isAuthenticated: data?.authenticated === true,
    name: data?.authenticated ? data.name : "",
    email: data?.authenticated ? data.email : "",
    isLoading,
    login: async (email, password) => {
      const r = await apiLogin({ data: { email, password } });
      await invalidate();
      return r;
    },
    logout: async () => {
      await apiLogout();
      await invalidate();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
