import { cn } from "@/lib/utils";
import { spineStage } from "@/lib/state-machine";
import type { CaseStatus } from "@/lib/store/types";

const STEPS: { key: "pre" | "court" | "post"; label: string }[] = [
  { key: "pre", label: "Досудебная" },
  { key: "court", label: "Суд" },
  { key: "post", label: "После суда / МИБ" },
];

export function LifecycleSpine({ status, className }: { status: CaseStatus; className?: string }) {
  const active = spineStage(status);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {STEPS.map((s, i) => {
        const isActive = s.key === active;
        const isPassed =
          (active === "court" && s.key === "pre") ||
          (active === "post" && (s.key === "pre" || s.key === "court"));
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={cn(
                "spine-step border",
                isActive && "bg-primary text-primary-foreground border-primary",
                isPassed && "bg-surface-2 text-foreground border-border",
                !isActive && !isPassed && "bg-surface text-muted-foreground border-border",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {s.label}
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
