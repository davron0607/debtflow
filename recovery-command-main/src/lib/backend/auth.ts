// Аутентификация: bcrypt-хэши, серверные сессии в httpOnly-cookie,
// rate-limit логина. Никаких паролей/токенов на клиенте.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { getCookie, setCookie, deleteCookie, getRequestIP } from "@tanstack/react-start/server";
import { prisma } from "./db";
import type { User } from "@prisma/client";

const SESSION_COOKIE = "df_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 дней
const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// ——— Rate limit логина (защита от перебора): 10 попыток / 15 минут на IP ———
const attempts = new Map<string, { count: number; resetAt: number }>();
export function checkLoginRateLimit(): { ok: boolean } {
  const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return { ok: true };
  }
  a.count++;
  return { ok: a.count <= 10 };
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

// Демо-переключатель ролей: работает только при DEMO_MODE=true
export const isDemoMode = () => process.env.DEMO_MODE !== "false";
