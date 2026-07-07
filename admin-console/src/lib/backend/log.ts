// Структурированное логирование: JSON-строки в stdout.
// Railway/любой лог-коллектор парсит их без конфигурации.
// PII (ПИНФЛ, телефоны, пароли) в логи не пишем — только идентификаторы.
import { getRequestIP } from "@tanstack/react-start/server";

type Level = "info" | "warn" | "error";

export function logEvent(
  level: Level,
  event: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
) {
  let ip: string | undefined;
  try {
    ip = getRequestIP({ xForwardedFor: true }) ?? undefined;
  } catch {
    // вне HTTP-контекста (сид, крон)
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ip,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// Обёртка серверной функции: логирует вызов, длительность и ошибки
export async function traced<T>(
  fn: string,
  userId: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    const r = result as { ok?: boolean; error?: string } | undefined;
    logEvent(r && r.ok === false ? "warn" : "info", "api_call", {
      fn,
      userId,
      ms: Date.now() - started,
      ok: r?.ok !== false,
      err: r?.error,
    });
    return result;
  } catch (e) {
    logEvent("error", "api_error", {
      fn,
      userId,
      ms: Date.now() - started,
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
