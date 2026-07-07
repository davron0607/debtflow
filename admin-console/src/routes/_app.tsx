import { createFileRoute, Navigate, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { Building2, ScrollText, LogOut, ShieldCheck, Users, LayoutDashboard, UserCog, Eye } from "lucide-react";
import { useStore } from "@/lib/store";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

const NAV = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/orgs", label: "Организации", icon: Building2 },
  { to: "/users", label: "Пользователи", icon: Users },
  { to: "/operators", label: "Операторы", icon: UserCog },
  { to: "/audit", label: "Журнал действий", icon: ScrollText },
];

function AppGuard() {
  const { isAuthenticated, isLoading, name, email, isReadOnly, logout } = useStore();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
          <LogoMark size={30} />
          <div className="leading-tight">
            <div className="font-display text-sm font-bold text-sidebar-foreground">
              Debt<span style={{ color: "#8CC63F" }}>Flow</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Консоль оператора</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active && "bg-sidebar-accent text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 border-t border-sidebar-border p-3 text-[10px] text-sidebar-foreground/60">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Нейтральный оператор — без доступа к делам банков и агентств.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-border bg-surface px-5">
          <div className="flex items-center gap-2 lg:hidden">
            <LogoMark size={22} />
            <span className="font-display text-sm font-bold">DebtFlow · Оператор</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {isReadOnly && (
              <span className="flex items-center gap-1 rounded-full bg-money/10 px-2 py-1 text-money">
                <Eye className="h-3 w-3" /> Только просмотр
              </span>
            )}
            <span>{name} · {email}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Выйти
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
