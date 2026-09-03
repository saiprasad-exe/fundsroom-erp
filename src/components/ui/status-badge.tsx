import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  ACTIVE: "bg-success/12 text-success border-success/25",
  CONFIRMED: "bg-success/12 text-success border-success/25",
  IN: "bg-success/12 text-success border-success/25",
  LEAD: "bg-warning/15 text-warning-foreground border-warning/35",
  DRAFT: "bg-warning/15 text-warning-foreground border-warning/35",
  LOW: "bg-warning/15 text-warning-foreground border-warning/35",
  INACTIVE: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/25",
  OUT: "bg-destructive/10 text-destructive border-destructive/25",
  OK: "bg-info/10 text-info border-info/25",
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide",
        TONES[value] ?? "bg-secondary text-secondary-foreground border-border",
      )}
    >
      {label ?? value}
    </span>
  );
}
