import type { UserRole } from "./store/types";

// Ролевая домашняя страница
export function homeFor(role: UserRole): string {
  if (role === "PLATFORM_ADMIN") return "/moderation";
  return role === "BANK_ADMIN" || role === "BANK_LEGAL" ? "/control-tower" : "/queue";
}
