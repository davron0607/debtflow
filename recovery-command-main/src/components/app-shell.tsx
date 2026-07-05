import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Upload,
  Briefcase,
  Users,
  Gavel,
  Shield,
  Scale,
  Calculator,
  Building2,
  Wallet,
  ClipboardList,
  ScrollText,
  Radio,
  Plug,
  UserCog,
  LogOut,
  Smartphone,
  MapPinned,
} from "lucide-react";
import { useStore } from "@/lib/store/store";
import { ROLE_LABEL, type UserRole } from "@/lib/store/types";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles?: UserRole[]; badge?: "V2" };

const NAV: NavItem[] = [
  { to: "/control-tower", label: "Командный пульт", icon: LayoutDashboard, roles: ["BANK_ADMIN", "BANK_LEGAL"] },
  { to: "/portfolio/upload", label: "Загрузка портфеля", icon: Upload, roles: ["BANK_ADMIN"] },
  { to: "/cases", label: "Все дела", icon: Briefcase, roles: ["BANK_ADMIN", "BANK_LEGAL"] },
  { to: "/my-cases", label: "Мои дела", icon: ClipboardList, roles: ["COLLECTOR", "LEGAL_FIRM", "MANAGER", "ACCOUNTANT"] },
  { to: "/field", label: "Полевой режим", icon: Smartphone, roles: ["COLLECTOR"] },
  { to: "/tracking", label: "GPS-мониторинг", icon: MapPinned, roles: ["BANK_ADMIN", "BANK_LEGAL", "MANAGER"] },
  { to: "/assignments", label: "Назначения / Маркет", icon: Users, roles: ["BANK_ADMIN"] },
  { to: "/agencies", label: "Аналитика агентств", icon: Building2, roles: ["BANK_ADMIN", "BANK_LEGAL"] },
  { to: "/roi", label: "ROI калькулятор", icon: Calculator, roles: ["BANK_ADMIN", "BANK_LEGAL"] },
  { to: "/court", label: "Суд (ручное ведение)", icon: Scale, roles: ["BANK_ADMIN", "BANK_LEGAL", "LEGAL_FIRM"] },
  { to: "/transfers", label: "Перевод средств", icon: Wallet, roles: ["COLLECTOR", "MANAGER", "ACCOUNTANT", "BANK_ADMIN"] },
  { to: "/users", label: "Пользователи и роли", icon: UserCog, roles: ["BANK_ADMIN", "MANAGER"] },
  { to: "/audit", label: "Аудит-журнал", icon: ScrollText },
  { to: "/mib", label: "МИБ / БПИ", icon: Radio, badge: "V2" },
  { to: "/integrations", label: "Интеграции", icon: Plug, badge: "V2" },
];

export function AppShell() {
  const { currentUser, setCurrentUserId, db, logout } = useStore();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const visibleNav = NAV.filter((n) => !n.roles || n.roles.includes(currentUser.role));

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
            <Shield className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold text-sidebar-foreground">DebtFlow</div>
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">Единая ОС взыскания</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visibleNav.map((item) => {
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
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/70">
                    {item.badge}
                  </span>
                )}
                {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-[10px] text-sidebar-foreground/60">
          Нейтральный слой координации.<br />Принуждение — только МИБ.
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-border bg-surface px-5">
          <div className="flex items-center gap-2 lg:hidden">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-display text-sm font-bold">DebtFlow</span>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <Gavel className="h-3.5 w-3.5" />
            <span className="font-mono uppercase tracking-widest">Tenge Bank · Тенант</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground md:inline">
              Роль (демо-переключатель):
            </span>
            <select
              value={currentUser.id}
              onChange={(e) => setCurrentUserId(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
            >
              {db.users.filter((u) => u.active !== false).map((u) => {
                const org = db.orgs.find((o) => o.id === u.orgId);
                return (
                  <option key={u.id} value={u.id}>
                    {ROLE_LABEL[u.role]} · {u.name} ({org?.name})
                  </option>
                );
              })}
            </select>
            <button
              onClick={logout}
              title="Выйти"
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Выйти</span>
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
