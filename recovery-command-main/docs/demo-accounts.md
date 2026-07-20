# Демо-учётки

Убраны со страницы логина (`/login`) — раньше показывались публично прямо в
UI. Пароль у всех один: **`demo123`** (см. `DEMO_PASSWORD` в
`src/lib/store/store.tsx`).

| E-mail | Роль | Организация |
|---|---|---|
| ops@debtflow.uz | Оператор платформы | DebtFlow |
| admin@tengebank.uz | Администратор банка | Tenge Bank |
| legal@tengebank.uz | Юрист банка | Tenge Bank |
| otabek@tengebank.uz | Soft-коллектор (in-house) | Tenge Bank |
| sherzod@tengebank.uz | Hard-коллектор (in-house) | Tenge Bank |
| gulbahor@tengebank.uz | Бухгалтер (in-house) | Tenge Bank |
| aziz@alpha-collect.uz | Коллектор | КА "Альфа-Взыскание" |
| sevara@alpha-collect.uz | Менеджер | КА "Альфа-Взыскание" |
| bekzod@alpha-collect.uz | Бухгалтер | КА "Альфа-Взыскание" |
| ulugbek@beta-resource.uz | Коллектор | КА "Бета-Ресурс" |
| n.saidova@lex.uz | Юрист | ЮФ "Lex Partners" |

Источник истины — `src/lib/store/seed.ts` (используется `prisma/seed.ts` при
`npm run db:seed`); сверяйте с ним, если список разъедется.

**Не публиковать этот файл наружу** — используйте его только для внутреннего
тестирования/демо. Продовые пароли реальных пользователей платформы этим
файлом не описываются.
