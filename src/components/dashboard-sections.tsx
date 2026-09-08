import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { Portal, Task } from "@/lib/types";
import { InitialAvatar, MiniBar } from "@/components/dashboard-widgets";

/* ------------------------------------------------------------------ */
/* Shared dashboard primitives used by all three portal dashboards.    */
/* ------------------------------------------------------------------ */

export type Tone = "primary" | "warning" | "success" | "info" | "destructive" | "chart2";

const toneIcon: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/20 text-warning-foreground",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
  destructive: "bg-destructive/12 text-destructive",
  chart2: "bg-chart-2/20 text-chart-2",
};

const toneText: Record<Tone, string> = {
  primary: "text-primary",
  warning: "text-warning-foreground",
  success: "text-success",
  info: "text-info",
  destructive: "text-destructive",
  chart2: "text-chart-2",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "primary",
  icon: Icon,
  to,
  portal,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
  icon: React.ComponentType<{ className?: string }>;
  to?: "tasks" | "activity" | "people";
  portal?: Portal;
}) {
  const body = (
    <div className="surface-card grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-4">
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", toneIcon[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        {hint ? <p className={cn("truncate text-[11px]", toneText[tone])}>{hint}</p> : null}
      </div>
    </div>
  );
  if (to && portal) {
    return (
      <Link
        to={to === "tasks" ? "/portal/$portal/tasks" : to === "people" ? "/portal/$portal/people" : "/portal/$portal/activity"}
        params={{ portal }}
        className="block rounded-xl transition-shadow hover:shadow-lift"
      >
        {body}
      </Link>
    );
  }
  return body;
}

export function SectionCard({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("surface-card flex min-w-0 flex-col p-5", className)}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

export function ViewAllLink({ portal, to }: { portal: Portal; to: "tasks" | "activity" | "people" }) {
  return (
    <Link
      to={to === "tasks" ? "/portal/$portal/tasks" : to === "people" ? "/portal/$portal/people" : "/portal/$portal/activity"}
      params={{ portal }}
      className="shrink-0 text-xs font-medium text-primary hover:underline"
    >
      View all
    </Link>
  );
}

export interface DonutSlice {
  key: string;
  name: string;
  value: number;
  color: string;
}

/** Donut chart with a centered total and a legend list on the right. */
export function DonutWithLegend({
  slices,
  centerValue,
  centerLabel,
  footer,
}: {
  slices: DonutSlice[];
  centerValue: number | string;
  centerLabel: string;
  footer?: ReactNode;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  const data = slices.filter((s) => s.value > 0);
  return (
    <div>
      <div className="grid items-center gap-4 sm:grid-cols-[126px_minmax(0,1fr)]">
        <div className="relative mx-auto h-[126px] w-[126px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.length ? data : [{ key: "empty", name: "None", value: 1, color: "var(--muted)" }]}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={59}
                paddingAngle={data.length > 1 ? 2 : 0}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {(data.length ? data : [{ key: "empty", color: "var(--muted)" }]).map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-bold leading-none">{centerValue}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{centerLabel}</p>
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          {slices.map((s) => (
            <li key={s.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 text-[11px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate text-muted-foreground">{s.name}</span>
              <span className="shrink-0 font-medium">
                {s.value} ({total ? Math.round((s.value / total) * 100) : 0}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
      {footer ? <div className="mt-4 text-center">{footer}</div> : null}
    </div>
  );
}

export function dueBadge(iso: string) {
  const day = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / day);
  if (diff < 0) return { label: "Overdue", chip: "bg-destructive/12 text-destructive", value: "text-destructive" };
  if (diff === 0) return { label: "Today", chip: "bg-destructive/12 text-destructive", value: "text-destructive" };
  if (diff === 1) return { label: "Tomorrow", chip: "bg-warning/20 text-warning-foreground", value: "text-warning-foreground" };
  return {
    label: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    chip: "bg-primary/10 text-primary",
    value: "text-primary",
  };
}

/** Deadline row used by the "Upcoming deadlines" cards on every portal. */
export function DeadlineRow({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const b = dueBadge(task.dueDate);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
      >
        <span className={cn("shrink-0 rounded-md px-2 py-1 text-[11px] font-medium", b.chip)}>{b.label}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{task.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {task.clientName !== "—" ? task.clientName : task.assignee}
          </span>
        </span>
        <span className={cn("shrink-0 text-xs font-medium", b.value)}>
          {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </button>
    </li>
  );
}

export interface WorkloadRow {
  id: string;
  name: string;
  color?: string;
  active: number;
  overdue: number;
  completed: number;
  pct: number;
}

export function WorkloadTable({ rows }: { rows: WorkloadRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No team members yet.</p>;
  }
  return (
    <div className="-mx-1 w-full min-w-0 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pb-2 font-medium">Team member</th>
            <th className="pb-2 text-center font-medium">Active</th>
            <th className="pb-2 text-center font-medium">Overdue</th>
            <th className="pb-2 text-center font-medium">Done</th>
            <th className="pb-2 font-medium">Workload</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="py-2 pr-3">
                <span className="flex min-w-0 items-center gap-2">
                  <InitialAvatar name={r.name} {...(r.color ? { color: r.color } : {})} />
                  <span className="truncate font-medium">{r.name}</span>
                </span>
              </td>
              <td className="px-2 text-center">{r.active}</td>
              <td className={cn("px-2 text-center", r.overdue > 0 && "text-destructive")}>{r.overdue}</td>
              <td className="px-2 text-center">{r.completed}</td>
              <td className="w-28 py-2">
                <span className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-[11px] text-muted-foreground">{r.pct}%</span>
                  <span className="min-w-0 flex-1">
                    <MiniBar value={r.pct} max={100} />
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
