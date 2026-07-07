-- Ограниченная роль Postgres для runtime консоли оператора (admin-console).
-- Вторая линия защиты после кода: даже баг/уязвимость в admin-console не
-- даст прочитать дела, платежи, документы банков и агентств — на уровне
-- СУБД у роли попросту нет прав на эти таблицы.
--
-- Запускать ОДИН РАЗ от имени владельца БД (пользователь из основного
-- DATABASE_URL приложения recovery-command-main), например:
--   psql "$DATABASE_URL" -f scripts/create-admin-console-role.sql
-- или через `railway connect postgres` / встроенный psql-консоль Railway.
--
-- После выполнения возьмите пароль ниже (замените на сгенерированный!) и
-- соберите DATABASE_URL для сервиса admin-console на Railway:
--   postgresql://debtflow_admin_console:<пароль>@<host>:<port>/<db>

-- 1) Роль с логином и собственным паролем (ЗАМЕНИТЬ перед запуском в проде)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'debtflow_admin_console') THEN
    CREATE ROLE debtflow_admin_console WITH LOGIN PASSWORD 'CHANGE_ME_STRONG_RANDOM_PASSWORD';
  END IF;
END
$$;

-- 2) Доступ к схеме
GRANT USAGE ON SCHEMA public TO debtflow_admin_console;

-- 3) Явный allow-list таблиц. Всё, что не перечислено ниже
--    (Case, CaseEvent, Payment, CostEntry, CaseDocument, SlaTimer,
--    Assignment, Transfer, FieldVisit, Debtor, PasswordResetToken,
--    EmailVerificationToken), остаётся БЕЗ ДОСТУПА по умолчанию —
--    ничего дополнительно отзывать не нужно.

-- Organization: читать всё, обновлять статус (одобрение/приостановка/архивация)
-- и тарифные поля (plan/maxUsers/maxCases) — квоты, не данные дел.
GRANT SELECT ON "Organization" TO debtflow_admin_console;
GRANT UPDATE ("status", "plan", "maxUsers", "maxCases") ON "Organization" TO debtflow_admin_console;

-- User: чтение — для логина оператора и телеметрии (email/role/active).
-- Точечные UPDATE — только для операций саппорта над учётками сотрудников
-- банков/агентств: сброс пароля (passwordHash) и блокировка/разблокировка
-- (active). Никакие другие поля (email, role, orgId и т.д.) не изменяемы.
GRANT SELECT ON "User" TO debtflow_admin_console;
GRANT UPDATE ("passwordHash", "active") ON "User" TO debtflow_admin_console;

-- INSERT + точечный UPDATE(operatorLevel) — только чтобы консоль сама могла
-- приглашать новых операторов платформы (role=PLATFORM_ADMIN, orgId=org_platform)
-- и назначать им уровень доступа (FULL/READ_ONLY). Код приложения обязан сам
-- гарантировать role='PLATFORM_ADMIN' и orgId='org_platform' при INSERT —
-- на уровне БД это не проверяется (row-level ограничения роль не поддерживает).
GRANT INSERT ON "User" TO debtflow_admin_console;
GRANT UPDATE ("operatorLevel") ON "User" TO debtflow_admin_console;

-- Session: чтение для телеметрии "последняя активность", запись собственной
-- сессии оператора при входе, удаление — при приостановке организации
-- (обрыв сессий её сотрудников).
GRANT SELECT, INSERT, DELETE ON "Session" TO debtflow_admin_console;

-- PlatformAuditEvent: собственный append-only журнал консоли.
GRANT SELECT, INSERT ON "PlatformAuditEvent" TO debtflow_admin_console;

-- Case: ТОЛЬКО не-конфиденциальные колонки, только для подсчёта использования
-- квоты (сколько дел у организации) — суммы, должник, статус взыскания по
-- существу, документы и платежи по-прежнему НЕДОСТУПНЫ (нет доступа к таблице
-- целиком, только эти 4 колонки; невозможно прочитать amountUSD/debtorId и т.д.).
GRANT SELECT ("id", "tenantBankId", "assignedOrgId", "status", "createdAt") ON "Case" TO debtflow_admin_console;

-- RateLimit: общий rate-limit логина, отдельные ключи (admin-login-*).
GRANT SELECT, INSERT, UPDATE ON "RateLimit" TO debtflow_admin_console;

-- Проверка (выполнить отдельно, для аудита выданных прав):
-- SELECT table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'debtflow_admin_console'
--   ORDER BY table_name, privilege_type;
