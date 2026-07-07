import { cn } from "@/lib/utils";
import { spineStage, STATUS_LABEL } from "@/lib/state-machine";
import type { CaseStatus } from "@/lib/store/types";

const STEPS: { key: "pre" | "court" | "post" | "resolved"; label: string }[] = [
  { key: "pre", label: "Досудебная" },
  { key: "court", label: "Суд" },
  { key: "post", label: "После суда / МИБ" },
  { key: "resolved", label: "Исход" },
];

// Финальный шаг красится и подписывается по фактическому статусу — иначе
// "Оплачено" визуально выглядело бы как продолжение судебной стадии.
const RESOLVED_TONE: Record<string, string> = {
  PAID: "bg-success text-success-foreground border-success",
  CLOSED: "bg-success text-success-foreground border-success",
  WRITTEN_OFF: "bg-destructive text-destructive-foreground border-destructive",
};

export function LifecycleSpine({ status, className }: { status: CaseStatus; className?: string }) {
  const active = spineStage(status);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {STEPS.map((s, i) => {
        const isActive = s.key === active;
        const isPassed =
          (active === "court" && s.key === "pre") ||
          ((active === "post" || active === "resolved") && (s.key === "pre" || s.key === "court"));
        const resolvedTone = isActive && s.key === "resolved" ? RESOLVED_TONE[status] : undefined;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={cn(
                "spine-step border",
                isActive && !resolvedTone && "bg-primary text-primary-foreground border-primary",
                resolvedTone,
                isPassed && "bg-surface-2 text-foreground border-border",
                !isActive && !isPassed && "bg-surface text-muted-foreground border-border",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {s.key === "resolved" && isActive ? STATUS_LABEL[status] : s.label}
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px w-6",
                  isPassed || isActive ? "bg-primary/60" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
