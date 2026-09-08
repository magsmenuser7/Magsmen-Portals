import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/types";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const statusStyles: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-info/15 text-info",
  in_review: "bg-chart-2/20 text-chart-2",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/12 text-destructive",
};

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-secondary text-secondary-foreground",
  high: "bg-warning/20 text-warning-foreground",
  urgent: "bg-destructive/15 text-destructive",
};

const base =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return <span className={cn(base, statusStyles[status], className)}>{STATUS_LABEL[status]}</span>;
}

export function PriorityPill({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <span className={cn(base, priorityStyles[priority], className)}>{PRIORITY_LABEL[priority]}</span>
  );
}
