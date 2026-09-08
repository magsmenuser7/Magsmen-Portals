import { CheckCircle2, CircleDot, Eye, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

/** Small initial-circle avatar used across the dashboard widgets. */
export function InitialAvatar({
  name,
  color,
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-primary-foreground",
        className,
      )}
      style={{ backgroundColor: color ?? "var(--primary)" }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

/** Colored status icon for activity feeds. */
export function StatusIcon({ status, className }: { status: TaskStatus | null; className?: string }) {
  const map: Record<TaskStatus, { Icon: typeof CheckCircle2; tone: string }> = {
    completed: { Icon: CheckCircle2, tone: "text-success" },
    rejected: { Icon: XCircle, tone: "text-destructive" },
    in_progress: { Icon: CircleDot, tone: "text-info" },
    in_review: { Icon: Eye, tone: "text-warning-foreground" },
    todo: { Icon: Circle, tone: "text-muted-foreground" },
  };
  const { Icon, tone } = status ? map[status] : { Icon: Circle, tone: "text-muted-foreground" };
  return <Icon className={cn("h-4 w-4 shrink-0", tone, className)} />;
}

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** Due-date urgency styling: <=2 days red, 3-7 days amber, otherwise neutral. */
export function dueTone(iso: string) {
  const d = daysUntil(iso);
  if (d <= 2) return { border: "border-destructive/50", badge: "bg-destructive/15 text-destructive" };
  if (d <= 7) return { border: "border-warning/50", badge: "bg-warning/20 text-warning-foreground" };
  return { border: "border-border", badge: "bg-muted text-muted-foreground" };
}

export function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}
