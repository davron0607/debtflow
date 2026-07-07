// Аутентификация консоли оператора. Отдельное приложение, отдельный домен,
// отдельная cookie — никак не пересекается с сессиями банков/агентств
// в основном клиентском приложении DebtFlow.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestIP,
  getRequestHeader,
  getRequestHost,
} from "@tanstack/react-start/server";
import { prisma } from "./db";
import { logEvent } from "./log";
import type { User } from "@prisma/client";

const SESSION_COOKIE = "dfadmin_session";
const SESSION_TTL_MS = 12 * 3600_000; // 12 часов — короче, чем у обычных пользователей
const BCRYPT_ROUNDS = 12;

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

// ——— CSRF: мутации принимаются только со своего origin ———
export function assertSameOrigin(): void {
  const sfs = getRequestHeader("sec-fetch-site");
  if (sfs && sfs !== "same-origin" && sfs !== "none") {
    logEvent("warn", "csrf_blocked", { secFetchSite: sfs });
    throw new Error("FORBIDDEN: cross-site request blocked");
  }
  const origin = getRequestHeader("origin");
  if (origin) {
    const host = getRequestHost({ xForwardedHost: true });
    const originHost = origin.replace(/^https?:\/\//, "");
    if (originHost !== host) {
      logEvent("warn", "csrf_blocked", { origin, host });
      throw new Error("FORBIDDEN: cross-site request blocked");
    }
  }
}

// ——— Rate limit логина (DB-backed, общая таблица с ограниченными правами) ———
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8; // строже, чем у основного приложения — учётка одна на всех

export async function checkLoginRateLimit(email: string): Promise<{ ok: boolean }> {
  const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
  const now = new Date();
  for (const key of [`admin-login-ip:${ip}`, `admin-login-email:${email.toLowerCase()}`]) {
    const rl = await prisma.rateLimit.findUnique({ where: { key } });
    if (!rl || now.getTime() - rl.windowStart.getTime() > WINDOW_MS) {
      await prisma.rateLimit.upsert({
        where: { key },
        update: { count: 1, windowStart: now },
        create: { key, count: 1, windowStart: now },
      });
      continue;
    }
    const updated = await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    if (updated.count > MAX_ATTEMPTS) {
      logEvent("warn", "rate_limited", { key });
      return { ok: false };
    }
  }
  return { ok: true };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: getRequestIP({ xForwardedFor: true }) ?? null,
    },
  });
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE);
  if (token) await prisma.session.deleteMany({ where: { token } });
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export async function currentUser(): Promise<User | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Консоль оператора обслуживает только роль PLATFORM_ADMIN — даже если
  // токен сессии как-то оказался бы валиден для другой роли, отвергаем.
  if (session.user.role !== "PLATFORM_ADMIN" || !session.user.active) return null;
  return session.user;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

export async function requireUserMutation(): Promise<User> {
  assertSameOrigin();
  const u = await requireUser();
  // READ_ONLY-операторы видят все страницы, но не могут проводить действия.
  // null/undefined (старые учётки до появления уровней) трактуется как FULL.
  if (u.operatorLevel === "READ_ONLY") throw new Error("FORBIDDEN: read-only operator");
  return u;
}
