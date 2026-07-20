import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Calculator,
  ClipboardList,
  Gavel,
  Landmark,
  Lock,
  Scale,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";

const AUDIENCES = [
  {
    icon: Landmark,
    title: "Банки и МФО",
    body: "Портфель под контролем: назначение агентствам, рекомендации Decision Engine, ROI-калькулятор суд/нотариус, единый аудит по каждому делу.",
  },
  {
    icon: Building2,
    title: "Коллекторские агентства",
    body: "Очередь задач по делам, полевой режим с геометками визитов, рейтинг команды, взаиморасчёты с банком — счета-фактуры за отчётный месяц.",
  },
  {
    icon: Scale,
    title: "Юридические фирмы",
    body: "Досудебная претензия, пакет для суда, сопровождение решения до передачи в БПИ — в одном деле, без переписки по e-mail.",
  },
];

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Портфель → Назначение → Взыскание",
    body: "Один жизненный цикл дела от загрузки портфеля до закрытия, с явными переходами и ролевым доступом на каждом шаге.",
  },
  {
    icon: Calculator,
    title: "Decision Engine",
    body: "Рекомендации по следующему шагу — звонок, визит, эскалация, реструктуризация или списание — с вероятностью взыскания и обоснованием.",
  },
  {
    icon: Gavel,
    title: "Досудебная → суд → БПИ",
    body: "Единый маршрут: претензия, выбор нотариус/суд, пакет документов, передача в Бюро принудительного исполнения — без потери истории.",
  },
  {
    icon: Wallet,
    title: "Взаиморасчёты банк ↔ агентство",
    body: "Счёт-фактура за календарный месяц: комиссия считается автоматически от фактически взысканного, с детализацией по каждому делу.",
  },
  {
    icon: ScrollText,
    title: "Неизменяемый аудит",
    body: "Каждое действие — платёж, смена статуса, назначение — записывается append-only и читается человеком, а не сырым JSON.",
  },
  {
    icon: ShieldCheck,
    title: "Роли и разграничение доступа",
    body: "Коллектор видит только свои дела, банк не вмешивается в работу агентства после передачи дела, бухгалтер не путает платежи с переводами.",
  },
];

const STEPS = [
  { n: "01", title: "Регистрация организации", body: "Банк/МФО подтверждается оператором платформы; агентства и юрфирмы получают дела от банков." },
  { n: "02", title: "Загрузка портфеля", body: "Банк загружает просроченные дела, система считает DPD и рекомендует маршрут." },
  { n: "03", title: "Назначение и работа", body: "Дело уходит агентству или ведётся in-house; коллектор работает из очереди задач." },
  { n: "04", title: "Взыскание и расчёты", body: "Платежи фиксируются по делу, комиссия агентства — автоматически в счёте за месяц." },
];

export function MarketingHome() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Logo size={30} />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#roles" className="hover:text-foreground">Для кого</a>
            <a href="#features" className="hover:text-foreground">Возможности</a>
            <a href="#how" className="hover:text-foreground">Как это работает</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Войти
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Регистрация организации
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:px-8 lg:py-28">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/40 px-3 py-1 text-xs uppercase tracking-widest text-sidebar-foreground/70">
              <Lock className="h-3 w-3" /> Neutral by design · Принуждение — только МИБ
            </div>
            <h1 className="font-display text-4xl font-bold leading-tight lg:text-5xl">
              Единая операционная система взыскания для банков, агентств и юристов
            </h1>
            <p className="mt-5 text-base text-sidebar-foreground/75 lg:text-lg">
              DebtFlow координирует банк, коллекторское агентство, юридическую фирму и БПИ на одном
              деле — с прозрачными переходами, ролевым доступом и неизменяемым аудитом каждого шага.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Зарегистрировать организацию <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="flex items-center gap-2 rounded-md border border-sidebar-border px-5 py-3 text-sm font-medium hover:bg-sidebar-accent/40"
              >
                У меня уже есть доступ
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-xs text-sidebar-foreground/60">
              <span>· Портфель → Назначение → Взыскание</span>
              <span>· Суд и МИБ — под контролем, без потери истории</span>
              <span>· Каждое действие — в аудите</span>
            </div>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 opacity-[0.06] lg:-right-8 lg:-top-8"
        >
          <LogoMark size={420} />
        </div>
      </section>

      {/* Аудитории */}
      <section id="roles" className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-display text-2xl font-bold lg:text-3xl">Для кого</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Один продукт — три роли участников процесса взыскания, каждая видит только своё.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="rounded-lg border border-border bg-surface p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <a.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Возможности */}
      <section id="features" className="border-y border-border bg-surface-2/50">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-2xl font-bold lg:text-3xl">Что уже работает</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Не обещания на будущее — конкретные модули, которыми пользуются банк, агентство и юрфирма сегодня.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-border bg-surface p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="font-display text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <h2 className="font-display text-2xl font-bold lg:text-3xl">Как это работает</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative">
              <div className="font-display text-3xl font-bold text-primary/25">{s.n}</div>
              <h3 className="mt-2 font-display text-sm font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight className="absolute -right-4 top-2 hidden h-4 w-4 text-border md:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Нейтралитет */}
      <section className="border-y border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-sidebar-foreground/60">
              <Users className="h-3.5 w-3.5" /> Нейтральный координатор
            </div>
            <h2 className="mt-2 font-display text-xl font-bold lg:text-2xl">
              DebtFlow не взыскивает и не судится сам
            </h2>
            <p className="mt-2 text-sm text-sidebar-foreground/70">
              Мы координируем банк, агентство, юрфирму и БПИ на одном деле. Принуждение — исключительно
              через Бюро принудительного исполнения, по решению суда или исполнительной надписи нотариуса.
            </p>
          </div>
          <Link
            to="/register"
            className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Начать работу <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted-foreground lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <Logo size={22} />
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/login" className="hover:text-foreground">Вход</Link>
            <Link to="/register" className="hover:text-foreground">Регистрация организации</Link>
          </div>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          © {new Date().getFullYear()} DebtFlow · debtflow.uz
        </div>
      </footer>
    </div>
  );
}
