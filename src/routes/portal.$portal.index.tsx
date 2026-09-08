import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  ListChecks,
  MessageSquare,
  PlayCircle,
  RefreshCw,
  UserPlus,
  UserX,
  XCircle,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { withoutHiddenMembers } from "@/lib/hidden-members";
import { PriorityBarChart } from "@/components/charts";
import { PriorityPill } from "@/components/pills";
import { InitialAvatar, MiniBar, StatusIcon, relativeTime } from "@/components/dashboard-widgets";
import {
  DeadlineRow,
  DonutWithLegend,
  KpiCard,
  SectionCard,
  ViewAllLink,
  WorkloadTable,
} from "@/components/dashboard-sections";
import type { DonutSlice, WorkloadRow } from "@/components/dashboard-sections";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { PORTAL_META, isPortal } from "@/lib/portal-nav";
import type { ClientRecord } from "@/lib/api";
import type { ActivityItem, Portal, Task, TeamMember } from "@/lib/types";

export const Route = createFileRoute("/portal/$portal/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Magsmen Portal" },
      { name: "description", content: "Task analytics, status breakdown and recent activity." },
      { property: "og:title", content: "Dashboard — Magsmen Portal" },
      { property: "og:description", content: "Realtime task analytics across your portal." },
    ],
  }),
  component: DashboardPage,
});

/* ----------------------------- date helpers ----------------------------- */
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const isOverdue = (t: Task) =>
  t.status !== "completed" &&
  t.status !== "rejected" &&
  startOfDay(new Date(t.dueDate)).getTime() < startOfDay(new Date()).getTime();
const isDueToday = (t: Task) =>
  startOfDay(new Date(t.dueDate)).getTime() === startOfDay(new Date()).getTime();
const withinDays = (iso: string, days: number) =>
  Date.now() - new Date(iso).getTime() <= days * 86400000;

const SLICE_COLORS = {
  completed: "var(--chart-4)",
  in_progress: "var(--chart-3)",
  todo: "var(--chart-1)",
  in_review: "var(--chart-2)",
  rejected: "var(--chart-5)",
};

function statusSlices(list: Task[]): DonutSlice[] {
  return [
    { key: "completed", name: "Completed", value: list.filter((t) => t.status === "completed").length, color: SLICE_COLORS.completed },
    { key: "in_progress", name: "In Progress", value: list.filter((t) => t.status === "in_progress").length, color: SLICE_COLORS.in_progress },
    { key: "todo", name: "Pending", value: list.filter((t) => t.status === "todo").length, color: SLICE_COLORS.todo },
    { key: "in_review", name: "Pending Approval", value: list.filter((t) => t.status === "in_review").length, color: SLICE_COLORS.in_review },
    { key: "rejected", name: "Rejected", value: list.filter((t) => t.status === "rejected").length, color: SLICE_COLORS.rejected },
  ];
}

function buildWorkload(members: TeamMember[], tasks: Task[]): WorkloadRow[] {
  const rows = withoutHiddenMembers(members).map((m) => {
    const mine = tasks.filter((t) => t.assignedTo === m.id);
    const active = mine.filter((t) => t.status !== "completed" && t.status !== "rejected").length;
    return {
      id: m.id,
      name: m.name,
      ...(m.color ? { color: m.color } : {}),
      active,
      overdue: mine.filter(isOverdue).length,
      completed: mine.filter((t) => t.status === "completed").length,
      pct: 0,
    };
  });
  const max = Math.max(1, ...rows.map((r) => r.active));
  return rows.map((r) => ({ ...r, pct: Math.round((r.active / max) * 100) }));
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
          <StatusIcon status={a.status ?? null} className="mt-0.5" />
          <p className="min-w-0 text-sm">
            <span className="font-medium">{a.actor}</span> {a.action}{" "}
            <span className="font-medium">{a.target}</span>
          </p>
          <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(a.at)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------ page shell ------------------------------ */

function DashboardPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "client") as Portal;
  const { tasks, activity, user, members, clients, syncLogs, meetings, messages, updateTask, retrySync } =
    useApp();
  const navigate = useNavigate();

  const openTask = (task: Task) =>
    navigate({
      to: "/portal/$portal/tasks",
      params: { portal },
      search: { q: task.id, status: "all", priority: "all" },
    });

  const scoped = useMemo(() => {
    if (portal === "client" && user?.company) {
      const mine = tasks.filter((t) => t.clientName === user.company);
      return mine.length ? mine : tasks;
    }
    return tasks;
  }, [portal, tasks, user]);

  return (
    <PortalShell
      portal={portal}
      title={`Hi ${user?.name.split(" ")[0] ?? "there"} 👋`}
      subtitle={PORTAL_META[portal].tagline}
      actions={
        <Button asChild>
          <Link to="/portal/$portal/tasks" params={{ portal }}>
            {portal === "client" ? "Request new work" : "Open task board"}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      }
    >
      {portal === "client" && (
        <ClientDashboard
          portal={portal}
          scoped={scoped}
          activity={activity}
          members={members}
          meetings={meetings}
          messages={messages}
          openTask={openTask}
        />
      )}
      {portal === "team" && (
        <TeamDashboard
          portal={portal}
          tasks={tasks}
          activity={activity}
          members={members}
          syncLogs={syncLogs}
          teamMemberId={user?.teamMemberId ?? null}
          openTask={openTask}
          updateTask={updateTask}
          retrySync={retrySync}
        />
      )}
      {portal === "admin" && (
        <AdminDashboard
          portal={portal}
          tasks={tasks}
          activity={activity}
          members={members}
          clients={clients}
          openTask={openTask}
          updateTask={updateTask}
        />
      )}
    </PortalShell>
  );
}

/* ------------------------------ CLIENT ------------------------------ */

function ClientDashboard({
  portal,
  scoped,
  activity,
  members,
  meetings,
  messages,
  openTask,
}: {
  portal: Portal;
  scoped: Task[];
  activity: ActivityItem[];
  members: TeamMember[];
  meetings: ReturnType<typeof useApp>["meetings"];
  messages: ReturnType<typeof useApp>["messages"];
  openTask: (t: Task) => void;
}) {
  const completed = scoped.filter((t) => t.status === "completed").length;
  const inProgress = scoped.filter((t) => t.status === "in_progress").length;
  const pendingApproval = scoped.filter((t) => t.status === "in_review").length;
  const rejected = scoped.filter((t) => t.status === "rejected").length;
  const overdue = scoped.filter(isOverdue).length;

  const progressGroups = useMemo(() => {
    const byTag = new Map<string, Task[]>();
    for (const t of scoped) {
      const key = t.tags[0] ?? "General";
      byTag.set(key, [...(byTag.get(key) ?? []), t]);
    }
    return [...byTag.entries()]
      .map(([name, list]) => ({
        name,
        started: list.reduce((min, t) => (t.createdAt < min ? t.createdAt : min), list[0]!.createdAt),
        pct: Math.round((list.filter((t) => t.status === "completed").length / list.length) * 100),
      }))
      .slice(0, 5);
  }, [scoped]);

  const deadlines = [...scoped]
    .filter((t) => t.status !== "completed" && t.status !== "rejected")
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
    .slice(0, 4);

  const approvals = scoped.filter((t) => t.status === "in_review").slice(0, 3);

  const projectTeam = useMemo(() => {
    const ids = new Set(scoped.map((t) => t.assignedTo).filter(Boolean));
    return members.filter((m) => ids.has(m.id)).slice(0, 4);
  }, [scoped, members]);

  const requests = [...scoped].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 3);
  const nextMeeting = [...meetings]
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];
  const lastMessage = [...messages].sort((a, b) => +new Date(b.at) - +new Date(a.at))[0];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Total Tasks" value={scoped.length} hint="Across all assignments" icon={ClipboardList} tone="primary" to="tasks" portal={portal} />
        <KpiCard label="In Progress" value={inProgress} hint="Currently in progress" icon={PlayCircle} tone="warning" />
        <KpiCard label="Completed" value={completed} hint="Delivered" icon={CheckCircle2} tone="success" />
        <KpiCard label="Pending Approval" value={pendingApproval} hint="Awaiting your review" icon={Clock} tone="chart2" />
        <KpiCard label="Rejected" value={rejected} hint="Not approved" icon={XCircle} tone="destructive" />
        <KpiCard label="Overdue" value={overdue} hint="Requires attention" icon={AlertCircle} tone="warning" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title="Tasks Progress Overview" subtitle="Track progress across your assignments">
          <ul className="space-y-4">
            {progressGroups.length === 0 && <li className="text-sm text-muted-foreground">No tasks yet.</li>}
            {progressGroups.map((g) => (
              <li key={g.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <InitialAvatar name={g.name} className="h-8 w-8 text-xs" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Started on {new Date(g.started).toLocaleDateString()}
                  </p>
                  <div className="mt-1.5">
                    <MiniBar value={g.pct} max={100} />
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold">{g.pct}%</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Tasks by Status" subtitle="Overview of all your tasks">
          <DonutWithLegend
            slices={statusSlices(scoped)}
            centerValue={scoped.length}
            centerLabel="Total"
            footer={
              <Link to="/portal/$portal/tasks" params={{ portal }} className="text-xs font-medium text-primary hover:underline">
                View all tasks →
              </Link>
            }
          />
        </SectionCard>

        <SectionCard
          title="Upcoming Deadlines"
          subtitle="Your important deadlines"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="space-y-1">
            {deadlines.length === 0 && <li className="text-sm text-muted-foreground">Nothing due — great work.</li>}
            {deadlines.map((t) => (
              <DeadlineRow key={t.id} task={t} onOpen={openTask} />
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Pending Your Approval"
          subtitle="Tasks waiting for your review"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="space-y-3">
            {approvals.length === 0 && <li className="text-sm text-muted-foreground">Nothing waiting on you.</li>}
            {approvals.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTask(t)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <FileCheck2 className="h-4 w-4 shrink-0 text-chart-2" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.clientName}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {relativeTime(t.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent Activity"
          subtitle="Latest updates on your assignments"
          action={<ViewAllLink portal={portal} to="activity" />}
        >
          <ActivityList items={activity.slice(0, 5)} />
        </SectionCard>

        <SectionCard title="Project Team" subtitle="People working on your tasks">
          <ul className="space-y-3">
            {projectTeam.length === 0 && <li className="text-sm text-muted-foreground">No one assigned yet.</li>}
            {projectTeam.map((m) => (
              <li key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <InitialAvatar name={m.name} color={m.color} className="h-8 w-8 text-xs" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.role}</p>
                </div>
                <a href={`mailto:${m.email}`} className="shrink-0 text-muted-foreground hover:text-primary">
                  <MessageSquare className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title="Messages" subtitle="Recent conversations">
          {lastMessage ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
              <InitialAvatar name={lastMessage.authorName} className="h-8 w-8 text-xs" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{lastMessage.authorName}</p>
                <p className="truncate text-xs text-muted-foreground">{lastMessage.body}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(lastMessage.at)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Next Meeting" subtitle="Your upcoming meeting">
          {nextMeeting ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{nextMeeting.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(nextMeeting.startsAt).toLocaleString()}
                </p>
              </div>
              <Button size="sm" variant="secondary" asChild>
                <a href={nextMeeting.link} target="_blank" rel="noreferrer">
                  Join
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No meetings scheduled.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Your Requests"
          subtitle="Track your work requests"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="space-y-3">
            {requests.length === 0 && <li className="text-sm text-muted-foreground">No requests yet.</li>}
            {requests.map((t) => (
              <li key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Requested on {new Date(t.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t.taskRef}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

/* ------------------------------- TEAM ------------------------------- */

function TeamDashboard({
  portal,
  tasks,
  activity,
  members,
  syncLogs,
  teamMemberId,
  openTask,
  updateTask,
  retrySync,
}: {
  portal: Portal;
  tasks: Task[];
  activity: ActivityItem[];
  members: TeamMember[];
  syncLogs: ReturnType<typeof useApp>["syncLogs"];
  teamMemberId: string | null;
  openTask: (t: Task) => void;
  updateTask: ReturnType<typeof useApp>["updateTask"];
  retrySync: ReturnType<typeof useApp>["retrySync"];
}) {
  const myTasks = useMemo(
    () => (teamMemberId ? tasks.filter((t) => t.assignedTo === teamMemberId) : tasks),
    [tasks, teamMemberId],
  );
  const myActive = myTasks.filter((t) => t.status !== "completed" && t.status !== "rejected");
  const dueToday = myActive.filter(isDueToday).length;
  const overdue = myActive.filter(isOverdue).length;
  const completedWeek = myTasks.filter((t) => t.status === "completed" && withinDays(t.updatedAt, 7)).length;

  const dueSoon = [...myActive].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)).slice(0, 4);
  const deadlines = [...tasks]
    .filter((t) => t.status !== "completed" && t.status !== "rejected")
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
    .slice(0, 4);

  const workload = useMemo(() => buildWorkload(members, tasks), [members, tasks]);
  const capacity = Math.max(myTasks.length, 8);

  const syncSummary = useMemo(() => {
    const synced = syncLogs.filter((s) => s.syncStatus === "synced").length;
    const failed = syncLogs.filter((s) => s.syncStatus === "failed");
    return { synced, failed, total: syncLogs.length };
  }, [syncLogs]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <KpiCard label="My Tasks" value={myTasks.length} hint={`${myActive.length} active`} icon={ClipboardList} tone="primary" to="tasks" portal={portal} />
        <KpiCard label="In Progress" value={myTasks.filter((t) => t.status === "in_progress").length} hint="Currently working" icon={PlayCircle} tone="warning" />
        <KpiCard label="Due Today" value={dueToday} hint="Needs attention" icon={CalendarClock} tone="chart2" />
        <KpiCard label="Overdue" value={overdue} hint="Take action" icon={AlertCircle} tone="destructive" />
        <KpiCard label="Completed This Week" value={completedWeek} hint="Nice work" icon={CheckCircle2} tone="success" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <SectionCard
          title="My Tasks Due Soon"
          subtitle="Your next deadlines"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="space-y-1">
            {dueSoon.length === 0 && <li className="text-sm text-muted-foreground">No tasks assigned to you.</li>}
            {dueSoon.map((t) => (
              <DeadlineRow key={t.id} task={t} onOpen={openTask} />
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="My Workload" subtitle="Your task capacity and progress">
          <DonutWithLegend
            slices={[
              { key: "active", name: "Active", value: myActive.length, color: "var(--chart-4)" },
              { key: "free", name: "Available", value: Math.max(capacity - myActive.length, 0), color: "var(--muted)" },
            ]}
            centerValue={`${myActive.length} / ${capacity}`}
            centerLabel="Active tasks"
            footer={
              <p className="text-xs text-muted-foreground">
                Capacity: {capacity} tasks · Available: {Math.max(capacity - myActive.length, 0)}
              </p>
            }
          />
        </SectionCard>

        <SectionCard title="My Task Status" subtitle="Based on all your tasks">
          <DonutWithLegend
            slices={statusSlices(myTasks)}
            centerValue={myTasks.length}
            centerLabel="Total"
            footer={
              <Link to="/portal/$portal/tasks" params={{ portal }} className="text-xs font-medium text-primary hover:underline">
                View full report →
              </Link>
            }
          />
        </SectionCard>

        <SectionCard title="My Priority Mix" subtitle="Open vs completed per priority">
          <PriorityBarChart tasks={myTasks} />
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Team Workload"
          subtitle="Who is working on what"
          action={<ViewAllLink portal={portal} to="people" />}
        >
          <WorkloadTable rows={workload} />
        </SectionCard>

        <SectionCard
          title="Recent Activity"
          subtitle="Latest updates from your team and tasks"
          action={<ViewAllLink portal={portal} to="activity" />}
        >
          <ActivityList items={activity.slice(0, 6)} />
        </SectionCard>

        <SectionCard
          title="Upcoming Deadlines"
          subtitle="Across the team"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="space-y-1">
            {deadlines.length === 0 && <li className="text-sm text-muted-foreground">Nothing due.</li>}
            {deadlines.map((t) => (
              <DeadlineRow key={t.id} task={t} onOpen={openTask} />
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title="Quick Status Update" subtitle="Move your active work forward">
          <ul className="space-y-3">
            {dueSoon.slice(0, 3).map((t) => (
              <li key={t.id} className="rounded-lg border border-border p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <PriorityPill priority={t.priority} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={t.status === "in_progress"}
                    onClick={async () => {
                      const ok = await updateTask(t.id, { status: "in_progress" });
                      if (ok) toast.success("Moved to In progress");
                      else toast.error("Status could not be updated");
                    }}
                  >
                    In progress
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const ok = await updateTask(t.id, { status: "completed" });
                      if (ok) toast.success("Marked completed");
                      else toast.error("Status could not be updated");
                    }}
                  >
                    Complete
                  </Button>
                </div>
              </li>
            ))}
            {dueSoon.length === 0 && <li className="text-sm text-muted-foreground">Nothing to update.</li>}
          </ul>
        </SectionCard>

        <SectionCard title="Team Members" subtitle="Your teammates" action={<ViewAllLink portal={portal} to="people" />}>
          <ul className="space-y-3">
            {withoutHiddenMembers(members).slice(0, 5).map((m) => (
              <li key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <InitialAvatar name={m.name} color={m.color} className="h-8 w-8 text-xs" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.role}</p>
                </div>
                <span className="shrink-0 text-[11px] capitalize text-muted-foreground">{m.status}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="ClickUp Sync Status"
          subtitle="Two-way sync health"
          action={
            syncSummary.failed.length > 0 ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={async () => {
                  for (const row of syncSummary.failed) if (row.taskId) await retrySync(row.taskId);
                  toast.success("Retry triggered for failed syncs");
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry sync
              </button>
            ) : undefined
          }
        >
          <p className="text-sm">
            <span className="font-semibold">{syncSummary.synced}</span> of{" "}
            <span className="font-semibold">{syncSummary.total}</span> tasks synced
            {syncSummary.failed.length > 0 && (
              <span className="text-destructive"> · {syncSummary.failed.length} failed</span>
            )}
          </p>
          <div className="mt-2">
            <MiniBar value={syncSummary.synced} max={Math.max(syncSummary.total, 1)} />
          </div>
          <div className="mt-4 text-center">
            <Link to="/portal/$portal/integrations" params={{ portal }} className="text-xs font-medium text-primary hover:underline">
              Go to ClickUp Sync →
            </Link>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

/* ------------------------------- ADMIN ------------------------------- */

function AdminDashboard({
  portal,
  tasks,
  activity,
  members,
  clients,
  openTask,
  updateTask,
}: {
  portal: Portal;
  tasks: Task[];
  activity: ActivityItem[];
  members: TeamMember[];
  clients: ClientRecord[];
  openTask: (t: Task) => void;
  updateTask: ReturnType<typeof useApp>["updateTask"];
}) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const inFlight = tasks.filter((t) => t.status === "in_progress" || t.status === "in_review").length;
  const overdue = tasks.filter(isOverdue);
  const dueToday = tasks.filter((t) => isDueToday(t) && t.status !== "completed").length;
  const approvals = tasks.filter((t) => t.status === "in_review");
  const noDeadline = tasks.filter((t) => !t.dueDate).length;
  const unassigned = tasks.filter((t) => !t.assignedTo);

  const workload = useMemo(() => buildWorkload(members, tasks), [members, tasks]);

  const clientRows = useMemo(
    () =>
      clients.map((c) => {
        const list = tasks.filter((t) => t.clientId === c.id);
        const done = list.filter((t) => t.status === "completed").length;
        const late = list.filter(isOverdue).length;
        return {
          ...c,
          tasks: list.length,
          pct: list.length ? Math.round((done / list.length) * 100) : 0,
          health: late > 1 ? "Delayed" : late === 1 ? "At risk" : "On track",
        };
      }),
    [clients, tasks],
  );

  const health = {
    onTrack: clientRows.filter((c) => c.health === "On track").length,
    atRisk: clientRows.filter((c) => c.health === "At risk").length,
    delayed: clientRows.filter((c) => c.health === "Delayed").length,
  };

  const deadlines = [...tasks]
    .filter((t) => t.status !== "completed" && t.status !== "rejected")
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))
    .slice(0, 4);

  const attention = [
    { label: "Overdue Tasks", count: overdue.length, icon: AlertCircle, tone: "text-destructive" },
    { label: "Pending Approvals", count: approvals.length, icon: FileCheck2, tone: "text-chart-2" },
    { label: "Tasks Without Deadlines", count: noDeadline, icon: CalendarClock, tone: "text-warning-foreground" },
    { label: "Unassigned Tasks", count: unassigned.length, icon: UserX, tone: "text-primary" },
    { label: "Clients Onboarded", count: clients.length, icon: UserPlus, tone: "text-success" },
  ];

  const consolidated = useMemo(() => {
    const taskEvents = activity.slice(0, 10).map((a) => ({
      id: a.id,
      kind: "task" as const,
      at: a.at,
      actor: a.actor,
      action: a.action,
      target: a.target,
      status: a.status ?? null,
    }));
    const clientEvents = clients.slice(0, 5).map((c) => ({
      id: `client-${c.id}`,
      kind: "client" as const,
      at: c.createdAt,
      actor: c.companyName,
      action: "joined as a new client",
      target: "",
      status: null,
    }));
    return [...taskEvents, ...clientEvents].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6);
  }, [activity, clients]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Total Tasks" value={tasks.length} hint="Across all clients" icon={ListChecks} tone="primary" to="tasks" portal={portal} />
        <KpiCard label="In Flight" value={inFlight} hint="Being worked on" icon={PlayCircle} tone="warning" />
        <KpiCard label="Completed" value={completed} hint="Delivered" icon={CheckCircle2} tone="success" />
        <KpiCard label="Overdue" value={overdue.length} hint="Needs attention" icon={AlertCircle} tone="destructive" />
        <KpiCard label="Due Today" value={dueToday} hint="View tasks" icon={CalendarClock} tone="chart2" />
        <KpiCard label="Clients" value={clients.length} hint="Active accounts" icon={Briefcase} tone="info" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title="Task Distribution" subtitle="Share of tasks by status">
          <DonutWithLegend
            slices={statusSlices(tasks)}
            centerValue={tasks.length}
            centerLabel="Total"
            footer={
              <Link to="/portal/$portal/analytics" params={{ portal }} className="text-xs font-medium text-primary hover:underline">
                View full report →
              </Link>
            }
          />
        </SectionCard>

        <SectionCard title="Priority Mix" subtitle="Open vs completed per priority">
          <PriorityBarChart tasks={tasks} />
        </SectionCard>

        <SectionCard title="Needs Attention" subtitle="Items to act on today">
          <ul className="space-y-2">
            {attention.map((a) => (
              <li key={a.label}>
                <Link
                  to="/portal/$portal/tasks"
                  params={{ portal }}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted"
                >
                  <a.icon className={`h-4 w-4 shrink-0 ${a.tone}`} />
                  <span className="truncate text-sm">{a.label}</span>
                  <span className="shrink-0 text-sm font-semibold">{a.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Upcoming Deadlines"
          subtitle="Next work due"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="space-y-1">
            {deadlines.length === 0 && <li className="text-sm text-muted-foreground">Nothing due.</li>}
            {deadlines.map((t) => (
              <DeadlineRow key={t.id} task={t} onOpen={openTask} />
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Pending Approvals"
          subtitle="Submitted for review"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="space-y-3">
            {approvals.length === 0 && <li className="text-sm text-muted-foreground">Nothing awaiting approval.</li>}
            {approvals.slice(0, 4).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openTask(t)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <FileCheck2 className="h-4 w-4 shrink-0 text-chart-2" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Submitted by {t.assignee}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(t.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent Activity"
          subtitle="Tasks and new clients"
          action={<ViewAllLink portal={portal} to="activity" />}
        >
          <ol className="space-y-3">
            {consolidated.map((e) => (
              <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                {e.kind === "client" ? (
                  <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <StatusIcon status={e.status} className="mt-0.5" />
                )}
                <p className="min-w-0 text-sm">
                  <span className="font-medium">{e.actor}</span> {e.action}{" "}
                  {e.target && <span className="font-medium">{e.target}</span>}
                </p>
                <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(e.at)}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title="Clients Overview" subtitle="Accounts and completion">
          <div className="-mx-1 w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 text-center font-medium">Tasks</th>
                  <th className="pb-2 font-medium">Completion</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted-foreground">
                      No clients yet.
                    </td>
                  </tr>
                )}
                {clientRows.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <InitialAvatar name={c.companyName} />
                        <span className="truncate font-medium">{c.companyName}</span>
                      </span>
                    </td>
                    <td className="px-2 text-center">{c.tasks}</td>
                    <td className="w-28 py-2">
                      <span className="flex items-center gap-2">
                        <span className="w-8 shrink-0 text-[11px] text-muted-foreground">{c.pct}%</span>
                        <span className="min-w-0 flex-1">
                          <MiniBar value={c.pct} max={100} />
                        </span>
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          c.health === "On track"
                            ? "bg-success/15 text-success"
                            : c.health === "At risk"
                              ? "bg-warning/20 text-warning-foreground"
                              : "bg-destructive/12 text-destructive"
                        }`}
                      >
                        {c.health}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Team Workload"
          subtitle="Who is working on what"
          action={<ViewAllLink portal={portal} to="people" />}
        >
          <WorkloadTable rows={workload} />
        </SectionCard>

        <SectionCard title="Project Health" subtitle="Client account health">
          <DonutWithLegend
            slices={[
              { key: "ontrack", name: "On Track", value: health.onTrack, color: "var(--chart-4)" },
              { key: "atrisk", name: "At Risk", value: health.atRisk, color: "var(--chart-3)" },
              { key: "delayed", name: "Delayed", value: health.delayed, color: "var(--chart-5)" },
            ]}
            centerValue={clientRows.length}
            centerLabel="Total clients"
          />
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4">
        <SectionCard
          title="Unassigned Tasks"
          subtitle="Assign an owner to keep work moving"
          action={<ViewAllLink portal={portal} to="tasks" />}
        >
          <ul className="grid gap-3 md:grid-cols-2">
            {unassigned.length === 0 && <li className="text-sm text-muted-foreground">Every task has an owner.</li>}
            {unassigned.slice(0, 6).map((t) => (
              <li
                key={t.id}
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.clientName}</p>
                </div>
                <Select
                  onValueChange={async (name) => {
                    const ok = await updateTask(t.id, { assignee: name });
                    if (ok) toast.success(`Assigned to ${name}`);
                    else toast.error("Task could not be assigned");
                  }}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue placeholder="Assign to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
