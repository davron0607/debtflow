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

-- Organization: читать всё, обновлять только статус (одобрение/приостановка)
GRANT SELECT ON "Organization" TO debtflow_admin_console;
GRANT UPDATE ("status") ON "Organization" TO debtflow_admin_console;

-- User: только чтение — для логина оператора и телеметрии (email/role/active);
-- ни создавать, ни менять пользователей банков/агентств консоль не может.
GRANT SELECT ON "User" TO debtflow_admin_console;

-- Session: чтение для телеметрии "последняя активность", запись собственной
-- сессии оператора при входе, удаление — при приостановке организации
-- (обрыв сессий её сотрудников).
GRANT SELECT, INSERT, DELETE ON "Session" TO debtflow_admin_console;

-- PlatformAuditEvent: собственный append-only журнал консоли.
GRANT SELECT, INSERT ON "PlatformAuditEvent" TO debtflow_admin_console;

-- RateLimit: общий rate-limit логина, отдельные ключи (admin-login-*).
GRANT SELECT, INSERT, UPDATE ON "RateLimit" TO debtflow_admin_console;

-- Проверка (выполнить отдельно, для аудита выданных прав):
-- SELECT table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'debtflow_admin_console'
--   ORDER BY table_name, privilege_type;
