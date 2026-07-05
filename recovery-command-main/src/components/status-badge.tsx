import { cn } from "@/lib/utils";
import type { CaseStatus } from "@/lib/store/types";
import { STATUS_LABEL, statusTone } from "@/lib/state-machine";

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  const tone = statusTone(status);
  const cls =
    tone === "success"
      ? "bg-success/20 text-success border-success/30"
      : tone === "destructive"
      ? "bg-destructive/20 text-destructive border-destructive/40"
      : tone === "money"
      ? "bg-money/20 text-money border-money/40"
      : "bg-surface-2 text-foreground/80 border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        cls,
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
