import type { ComponentType } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from "recharts";
import { ArrowUpRight, TrendingDown, TrendingUp, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/types";
import type { Task, TaskStatus } from "@/lib/types";

export const STATUS_HEX: Record<TaskStatus, string> = {
  todo: "#3b82f6",
  in_progress: "#16a34a",
  in_review: "#f59e0b",
  rejected: "#64748b",
  completed: "#7c3aed",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------------------------------------------------------------- KPI card */

export function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = "primary",
  delta,
  deltaUp = true,
  caption = "vs last month",
  arrow = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "primary" | "success" | "info" | "warning" | "destructive";
  delta?: string;
  deltaUp?: boolean;
  caption?: string;
  arrow?: boolean;
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    info: "bg-info/15 text-info",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className="surface-card p-4 sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", toneMap[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
        {arrow && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold sm:text-3xl">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {delta && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn("inline-flex items-center gap-1 font-semibold", deltaUp ? "text-success" : "text-destructive")}>
            {deltaUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {delta}
          </span>
          <span className="text-muted-foreground">{caption}</span>
        </p>
      )}
    </div>
  );
}

export function Panel({
  title,
  aside,
  className,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("surface-card flex flex-col p-4 sm:p-5", className)}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ status donut */

export function StatusDonut({ tasks, totalLabel = "Total Tasks" }: { tasks: Task[]; totalLabel?: string }) {
  const rows = STATUS_ORDER.map((s) => ({
    key: s,
    name: STATUS_LABEL[s],
    value: tasks.filter((t) => t.status === s).length,
  }));
  const total = tasks.length;
  const data = rows.filter((r) => r.value > 0);

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <div className="relative mx-auto h-52 w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.length ? data : [{ key: "empty", name: "None", value: 1 }]} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={1} strokeWidth={0}>
              {(data.length ? data : [{ key: "empty" }]).map((d) => (
                <Cell key={d.key} fill={STATUS_HEX[d.key as TaskStatus] ?? "var(--muted)"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-3xl font-bold leading-none">{total}</p>
            <p className="mt-1 text-xs text-muted-foreground">{totalLabel}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_HEX[r.key] }} />
            <span className="truncate text-muted-foreground">{r.name}</span>
            <span className="font-semibold">{r.value}</span>
            <span className="w-12 text-right text-xs text-muted-foreground">
              ({total ? Math.round((r.value / total) * 100) : 0}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------- completion trend */

export function completionTrend(tasks: Task[], months = 6) {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const value = tasks.filter((t) => {
      if (t.status !== "completed") return false;
      const u = new Date(t.updatedAt);
      return u.getFullYear() === d.getFullYear() && u.getMonth() === d.getMonth();
    }).length;
    return { name: MONTHS[d.getMonth()]!, value };
  });
}

export function TrendAreaChart({ data, color = "#16a34a" }: { data: { name: string; value: number }[]; color?: string }) {
  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 18, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" width={38} />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#grad-${color.replace("#", "")})`} dot={{ r: 3.5, fill: color }}>
            <LabelList dataKey="value" position="top" fontSize={11} fill="var(--foreground)" />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------- misc pieces */

export function ProgressRow({ label, value, max, suffix, color = "var(--primary)" }: { label: string; value: number; max: number; suffix?: string; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)_auto] items-center gap-3 text-sm">
      <span className="truncate">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="w-12 text-right font-semibold">{suffix ?? value}</span>
    </div>
  );
}

export function DeadlineRow({ title, sub, dueDate }: { title: string; sub?: string; dueDate: string }) {
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  const tone = days <= 5 ? "text-destructive" : days <= 10 ? "text-warning-foreground" : "text-muted-foreground";
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
        <CalendarDays className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {sub ? `${sub} · ` : ""}
          {new Date(dueDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </span>
      <span className={cn("shrink-0 text-xs font-semibold", tone)}>
        {days < 0 ? `${Math.abs(days)} days late` : `${days} days left`}
      </span>
    </li>
  );
}

export function DonutGauge({ pct, label, color = "#16a34a" }: { pct: number; label: string; color?: string }) {
  const data = [
    { name: "done", value: pct },
    { name: "rest", value: Math.max(100 - pct, 0) },
  ];
  return (
    <div className="relative mx-auto h-40 w-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={54} outerRadius={70} startAngle={90} endAngle={-270} strokeWidth={0}>
            <Cell fill={color} />
            <Cell fill="var(--muted)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-bold leading-none">{pct}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
