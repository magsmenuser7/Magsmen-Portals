import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderKanban,
  Gauge,
  ListChecks,
  Star,
  Target,
  Timer,
  Users,
  XCircle,
  Download,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  KpiCard,
  Panel,
  StatusDonut,
  TrendAreaChart,
  ProgressRow,
  DeadlineRow,
  DonutGauge,
  completionTrend,
} from "@/components/analytics-sections";
import { StatusIcon, relativeTime } from "@/components/dashboard-widgets";
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import { withoutHiddenMembers } from "@/lib/hidden-members";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/types";
import type { Portal, Task } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/$portal/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Magsmen Portal" },
      { name: "description", content: "Live performance, delivery and productivity metrics across your portal." },
      { property: "og:title", content: "Analytics — Magsmen Portal" },
      { property: "og:description", content: "Completion trends, task distribution and delivery speed in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

const PRIORITY_HEX: Record<string, string> = {
  low: "#16a34a",
  normal: "#3b82f6",
  high: "#f59e0b",
  urgent: "#dc2626",
};

function avgDays(tasks: Task[]) {
  const done = tasks.filter((t) => t.status === "completed");
  if (!done.length) return "0";
  const total = done.reduce((a, t) => a + (+new Date(t.updatedAt) - +new Date(t.createdAt)) / 86400000, 0);
  return (total / done.length).toFixed(1);
}

function upcoming(tasks: Task[], n = 4) {
  return tasks
    .filter((t) => t.status !== "completed" && t.dueDate)
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
    .slice(0, n);
}

function ExportReport() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {["PDF", "Excel", "CSV"].map((f) => (
          <DropdownMenuItem key={f} onSelect={() => toast.success(`${f} report exported`)}>
            {f}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Footnote({ text }: { text: string }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
      <span>{text}</span>
      <span>Live · updates automatically</span>
    </div>
  );
}

function AnalyticsPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "client") as Portal;
  const { tasks, members: rawMembers, clients, activity, user } = useApp();
  const members = useMemo(() => withoutHiddenMembers(rawMembers), [rawMembers]);

  const scoped = useMemo(() => {
    if (portal === "client") {
      if (user?.clientId) return tasks.filter((t) => t.clientId === user.clientId);
      if (user?.company) return tasks.filter((t) => t.clientName === user.company);
      return tasks;
    }
    if (portal === "team") {
      if (user?.teamMemberId) return tasks.filter((t) => t.assignedTo === user.teamMemberId);
      if (user?.name) return tasks.filter((t) => t.assignee === user.name);
      return tasks;
    }
    return tasks;
  }, [portal, tasks, user]);

  const done = scoped.filter((t) => t.status === "completed");
  const inProgress = scoped.filter((t) => t.status === "in_progress");
  const inReview = scoped.filter((t) => t.status === "in_review");
  const rejected = scoped.filter((t) => t.status === "rejected");
  const trend = useMemo(() => completionTrend(scoped), [scoped]);
  const onTime = done.filter((t) => !t.dueDate || +new Date(t.updatedAt) <= +new Date(t.dueDate) + 86400000);
  const onTimePct = done.length ? Math.round((onTime.length / done.length) * 100) : 0;
  const completionRate = scoped.length ? Math.round((done.length / scoped.length) * 100) : 0;

  const feed = activity.slice(0, 5);

  const subtitleMap: Record<Portal, string> = {
    client: "Track your project progress and task performance.",
    team: "Track your performance and productivity metrics.",
    admin: "Organization performance overview and key metrics.",
  };

  return (
    <PortalShell portal={portal} title="Analytics" subtitle={subtitleMap[portal]} actions={<ExportReport />}>
      {portal === "client" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard label="Total Projects" value={new Set(scoped.map((t) => t.tags[0] ?? t.clientName)).size} icon={FolderKanban} tone="success" delta={`${scoped.length}`} caption="tasks tracked" />
            <KpiCard label="Tasks Completed" value={done.length} icon={CheckCircle2} tone="success" delta={`${completionRate}%`} caption="completion rate" />
            <KpiCard label="In Progress" value={inProgress.length} icon={Timer} tone="info" delta={`${inProgress.length}`} caption="active now" />
            <KpiCard label="Pending Approval" value={inReview.length} icon={ListChecks} tone="warning" delta={`${inReview.length}`} caption="awaiting review" deltaUp={false} />
            <KpiCard label="Rejected Tasks" value={rejected.length} icon={XCircle} tone="destructive" delta={`${rejected.length}`} caption="needs rework" deltaUp={false} />
            <KpiCard label="Avg. Completion Time" value={avgDays(scoped)} unit="days" icon={Clock} tone="primary" delta={`${onTimePct}%`} caption="on time" />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <Panel title="Project Progress Overview">
              <div className="space-y-3.5">
                {(() => {
                  const groups = new Map<string, Task[]>();
                  for (const t of scoped) {
                    const key = t.tags[0] ?? t.clientName ?? "General";
                    groups.set(key, [...(groups.get(key) ?? []), t]);
                  }
                  const rows = Array.from(groups.entries()).slice(0, 6);
                  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No projects yet.</p>;
                  return rows.map(([name, list]) => {
                    const pct = Math.round((list.filter((t) => t.status === "completed").length / list.length) * 100);
                    return <ProgressRow key={name} label={name} value={pct} max={100} suffix={`${pct}%`} color="#16a34a" />;
                  });
                })()}
              </div>
            </Panel>

            <Panel title="Task Status Distribution">
              <StatusDonut tasks={scoped} />
            </Panel>

            <Panel title="Task Completion Trend" aside={<span className="text-xs text-muted-foreground">Last 6 months</span>}>
              <TrendAreaChart data={trend} />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Panel title="Upcoming Deadlines">
              <ul className="divide-y divide-border">
                {upcoming(scoped).map((t) => (
                  <DeadlineRow key={t.id} title={t.title} dueDate={t.dueDate} />
                ))}
                {!upcoming(scoped).length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing due.</p>}
              </ul>
            </Panel>

            <Panel title="Performance Summary">
              <div className="grid grid-cols-2 gap-4">
                <SummaryStat icon={Clock} label="On-Time Tasks" value={`${onTimePct}%`} />
                <SummaryStat icon={Target} label="Completion Rate" value={`${completionRate}%`} />
                <SummaryStat icon={Star} label="Open Tasks" value={`${scoped.length - done.length}`} />
                <SummaryStat icon={Gauge} label="Avg. Response Time" value={`${avgDays(scoped)} d`} />
              </div>
            </Panel>

            <Panel title="Recent Activity">
              <ActivityFeed items={feed} />
            </Panel>
          </div>

          <Footnote text="Analytics data is based on the tasks and projects visible to you." />
        </>
      )}

      {portal === "team" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Tasks Completed" value={done.length} icon={CheckCircle2} tone="success" arrow delta={`${completionRate}%`} caption="completion rate" />
            <KpiCard label="Tasks In Progress" value={inProgress.length} icon={Briefcase} tone="info" arrow delta={`${inProgress.length}`} caption="active tasks" />
            <KpiCard label="Rejected Tasks" value={rejected.length} icon={XCircle} tone="destructive" arrow delta={`${rejected.length}`} caption="needs attention" deltaUp={false} />
            <KpiCard label="Avg. Completion" value={avgDays(scoped)} unit="days" icon={Clock} tone="primary" delta={`${onTimePct}%`} caption="on time" />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Panel title="Task Completion Trend" aside={<span className="text-xs text-muted-foreground">Last 6 months</span>}>
              <TrendAreaChart data={trend} color="#3b82f6" />
            </Panel>
            <Panel title="Task Status Distribution">
              <StatusDonut tasks={scoped} totalLabel="Tasks" />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Panel title="My Productivity">
              <ul className="space-y-3">
                <MetricRow icon={CheckCircle2} label="Tasks Completed" value={`${done.length}`} />
                <MetricRow icon={Target} label="Completion Rate" value={`${completionRate}%`} />
                <MetricRow icon={Clock} label="On-time Completion" value={`${onTimePct}%`} />
                <MetricRow icon={Timer} label="Average Completion Time" value={`${avgDays(scoped)} days`} />
              </ul>
            </Panel>

            <Panel title="Deadline Performance">
              <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <DonutGauge pct={onTimePct} label="On Time" />
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Completed On Time</span>
                    <span className="font-semibold">{onTime.length}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Completed Late</span>
                    <span className="font-semibold text-warning-foreground">{done.length - onTime.length}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Currently Rejected</span>
                    <span className="font-semibold text-destructive">{rejected.length}</span>
                  </li>
                </ul>
              </div>
            </Panel>

            <Panel title="Priority Performance">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Priority</th>
                      <th className="pb-2 text-left font-medium">Completed</th>
                      <th className="pb-2 text-right font-medium">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRIORITY_ORDER.map((p) => {
                      const list = scoped.filter((t) => t.priority === p);
                      const c = list.filter((t) => t.status === "completed").length;
                      const pend = list.length - c;
                      return (
                        <tr key={p} className="border-t border-border">
                          <td className="py-2.5">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_HEX[p] }} />
                              {PRIORITY_LABEL[p]}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="font-semibold">{c}</span>
                              <span className="h-2 w-16 overflow-hidden rounded-full bg-muted sm:w-24">
                                <span
                                  className="block h-full rounded-full"
                                  style={{ width: `${list.length ? (c / list.length) * 100 : 0}%`, background: PRIORITY_HEX[p] }}
                                />
                              </span>
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-semibold">{pend}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Footnote text="Analytics are based on tasks assigned to you." />
        </>
      )}

      {portal === "admin" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard label="Total Clients" value={clients.length} icon={Users} tone="info" delta={`${clients.length}`} caption="active" />
            <KpiCard label="Total Projects" value={new Set(tasks.map((t) => t.tags[0] ?? t.clientName)).size} icon={FolderKanban} tone="primary" delta={`${tasks.length}`} caption="tasks tracked" />
            <KpiCard label="Total Tasks" value={tasks.length} icon={ListChecks} tone="warning" delta={`${inProgress.length}`} caption="in progress" />
            <KpiCard label="Team Members" value={members.length} icon={Users} tone="success" delta={`${members.filter((m) => m.status === "online").length}`} caption="with accounts" />
            <KpiCard label="Pending Approvals" value={inReview.length} icon={CalendarClock} tone="warning" delta={`${inReview.length}`} caption="awaiting review" deltaUp={false} />
            <KpiCard label="Completed" value={done.length} icon={CheckCircle2} tone="success" delta={`${completionRate}%`} caption="completion rate" />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <Panel title="Task Completion Trend" aside={<span className="text-xs text-muted-foreground">Last 6 months</span>}>
              <TrendAreaChart data={trend} color="#3b82f6" />
            </Panel>
            <Panel title="Task Status Distribution">
              <StatusDonut tasks={tasks} />
            </Panel>
            <Panel title="Team Workload">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Team Member</th>
                      <th className="pb-2 text-right font-medium">Assigned</th>
                      <th className="pb-2 text-right font-medium">In Progress</th>
                      <th className="pb-2 text-right font-medium">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.slice(0, 6).map((m) => {
                      const mine = tasks.filter((t) => t.assignedTo === m.id);
                      return (
                        <tr key={m.id} className="border-t border-border">
                          <td className="py-2.5 pr-2">
                            <span className="block max-w-[140px] truncate">{m.name}</span>
                          </td>
                          <td className="py-2.5 text-right font-semibold">{mine.length}</td>
                          <td className="py-2.5 text-right">{mine.filter((t) => t.status === "in_progress").length}</td>
                          <td className="py-2.5 text-right">{mine.filter((t) => t.status === "completed").length}</td>
                        </tr>
                      );
                    })}
                    {!members.length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          No team members yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Panel title="Top Clients by Tasks">
              <div className="space-y-3.5">
                {(() => {
                  const counts = new Map<string, number>();
                  for (const t of tasks) counts.set(t.clientName, (counts.get(t.clientName) ?? 0) + 1);
                  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  const max = rows[0]?.[1] ?? 1;
                  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No clients yet.</p>;
                  return rows.map(([name, count]) => (
                    <ProgressRow key={name} label={name} value={count} max={max} color="#7c3aed" />
                  ));
                })()}
              </div>
            </Panel>

            <Panel title="Tasks by Priority">
              <div className="space-y-3.5">
                {PRIORITY_ORDER.map((p) => {
                  const count = tasks.filter((t) => t.priority === p).length;
                  return (
                    <ProgressRow
                      key={p}
                      label={PRIORITY_LABEL[p]}
                      value={count}
                      max={Math.max(...PRIORITY_ORDER.map((x) => tasks.filter((t) => t.priority === x).length), 1)}
                      color={PRIORITY_HEX[p]!}
                    />
                  );
                })}
              </div>
            </Panel>

            <Panel title="Upcoming Deadlines">
              <ul className="divide-y divide-border">
                {upcoming(tasks).map((t) => (
                  <DeadlineRow key={t.id} title={t.title} sub={t.clientName} dueDate={t.dueDate} />
                ))}
                {!upcoming(tasks).length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing due.</p>}
              </ul>
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel title="Approval Summary">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <SummaryStat icon={ListChecks} label="Total Requests" value={`${tasks.length}`} />
                <SummaryStat icon={CalendarClock} label="Pending" value={`${inReview.length}`} />
                <SummaryStat icon={CheckCircle2} label="Approved" value={`${done.length}`} />
                <SummaryStat icon={XCircle} label="Rejected" value={`${rejected.length}`} />
              </div>
            </Panel>
            <Panel title="Recent Activity">
              <ActivityFeed items={feed} />
            </Panel>
          </div>

          <Footnote text="Analytics are real-time and based on all active clients, tasks and team activity." />
        </>
      )}
    </PortalShell>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-2 truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold">{value}</p>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate text-sm">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </li>
  );
}

function ActivityFeed({ items }: { items: ReturnType<typeof useApp>["activity"] }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
          <StatusIcon status={a.status ?? null} className="mt-0.5" />
          <span className="min-w-0">
            <span className="block truncate text-sm">
              {a.action} · <span className="font-medium">{a.target}</span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">{a.actor}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.at)}</span>
        </li>
      ))}
    </ul>
  );
}
