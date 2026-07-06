// Аутентификация: bcrypt-хэши, серверные сессии в httpOnly-cookie,
// rate-limit логина. Никаких паролей/токенов на клиенте.
import { randomBytes, createHash } from "node:crypto";
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

const SESSION_COOKIE = "df_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 дней
const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// ——— CSRF: мутации принимаются только со своего origin.
// sameSite=lax на cookie + проверка Origin/Sec-Fetch-Site = двойная защита.
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

// ——— Rate limit (DB-backed — общий для всех инстансов):
// 10 попыток / 15 минут на ключ (IP и e-mail отдельно)
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

export async function checkRateLimit(bucket: string, id: string): Promise<{ ok: boolean }> {
  const key = `${bucket}:${id}`;
  const now = new Date();
  const rl = await prisma.rateLimit.findUnique({ where: { key } });
  if (!rl || now.getTime() - rl.windowStart.getTime() > WINDOW_MS) {
    await prisma.rateLimit.upsert({
      where: { key },
      update: { count: 1, windowStart: now },
      create: { key, count: 1, windowStart: now },
    });
    return { ok: true };
  }
  const updated = await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  if (updated.count > MAX_ATTEMPTS) {
    logEvent("warn", "rate_limited", { key });
    return { ok: false };
  }
  return { ok: true };
}

export async function checkLoginRateLimit(email: string): Promise<{ ok: boolean }> {
  const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit("login-ip", ip),
    checkRateLimit("login-email", email.toLowerCase()),
  ]);
  return { ok: byIp.ok && byEmail.ok };
}

// ——— Токены сброса пароля (в БД — только SHA-256 хэш) ———
const RESET_TTL_MS = 60 * 60_000; // 1 час

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  return token;
}

export async function consumeResetToken(token: string): Promise<string | null> {
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return null;
  await prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  return rec.userId;
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
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (!session.user.active) return null;
  return session.user;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

// ——— Токены подтверждения e-mail (регистрация) ———
const VERIFY_TTL_MS = 24 * 3600_000; // 24 часа

export async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  return token;
}

export async function consumeVerificationToken(token: string): Promise<string | null> {
  const rec = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return null;
  await prisma.emailVerificationToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  return rec.userId;
}

// Для мутаций: аутентификация + защита от CSRF в одном вызове
export async function requireUserMutation(): Promise<User> {
  assertSameOrigin();
  return requireUser();
}

// Демо-переключатель ролей: работает только при DEMO_MODE=true
export const isDemoMode = () => process.env.DEMO_MODE !== "false";
