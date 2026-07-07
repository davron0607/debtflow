// Prisma-клиент консоли оператора. Подключается ограниченным DB-пользователем
// (см. ../../../scripts/create-admin-console-role.sql) — доступ на уровне
// Postgres GRANT ограничен таблицами Organization/User/Session/
// PlatformAuditEvent/RateLimit. Даже баг в коде не даст прочитать Case/
// Payment/Document и т.д. — это вторая линия защиты после кода.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
