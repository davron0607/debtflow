import type { UserRole } from "./store/types";

// Ролевая домашняя страница
export function homeFor(role: UserRole): string {
  return role === "BANK_ADMIN" || role === "BANK_LEGAL" ? "/control-tower" : "/queue";
}
