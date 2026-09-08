import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  Link2,
  Loader2,
  MonitorPlay,
  Plus,
  Radio,
  Video,
  XCircle,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KpiCard } from "@/components/analytics-sections";
import { MiniCalendar, fmtDate, fmtTime, relativeDay } from "@/components/meeting-sections";
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import { cn } from "@/lib/utils";
import { effectiveMeetingStatus } from "@/lib/types";
import type { Meeting, Portal } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/$portal/meetings")({
  head: () => ({
    meta: [
      { title: "Meetings — Magsmen Portal" },
      { name: "description", content: "Schedule, join and track delivery meetings across clients and teams." },
      { property: "og:title", content: "Meetings — Magsmen Portal" },
      { property: "og:description", content: "Live, upcoming and past meetings per portal, updated in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeetingsPage,
});

const STATUS_STYLE: Record<Meeting["status"], string> = {
  live: "bg-success/15 text-success",
  scheduled: "bg-primary/10 text-primary",
  completed: "bg-success/12 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

const ICON_TONES = [
  "bg-primary/10 text-primary",
  "bg-[#efeaff] text-[#6b4ef5]",
  "bg-success/15 text-success",
  "bg-warning/20 text-warning-foreground",
  "bg-destructive/10 text-destructive",
];

function StatusChip({ status }: { status: Meeting["status"] }) {
  return (
    <span className={cn("inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize", STATUS_STYLE[status])}>
      {status}
    </span>
  );
}

function joinHref(m: Meeting, isHost: boolean) {
  return (isHost ? m.zoomStartUrl : null) || m.zoomJoinUrl || m.link || "";
}

/* ------------------------------------------------------------------ page */

function MeetingsPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "client") as Portal;
  const {
    user,
    meetings,
    meetingsLoading,
    portalUsers,
    clients,
    createMeeting,
    setMeetingStatus,
  } = useApp();
  const isAdmin = portal === "admin" && user?.portal === "admin";

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Meeting | null>(null);
  const [busy, setBusy] = useState(false);

  const all = useMemo(
    () =>
      meetings
        .map((m) => ({ ...m, status: effectiveMeetingStatus(m) }))
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [meetings],
  );

  const live = all.filter((m) => m.status === "live");
  const upcoming = all.filter((m) => m.status === "scheduled");
  const completed = all.filter((m) => m.status === "completed");
  const cancelled = all.filter((m) => m.status === "cancelled");
  const past = [...completed, ...cancelled].sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  const todays = all.filter((m) => new Date(m.startsAt).toDateString() === new Date().toDateString());

  const join = (m: Meeting): void => {
    const href = joinHref(m, m.hostId === user?.id);
    if (!href) {
      toast.error("No meeting link yet. Ask an admin to add the Zoom link.");
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const copyLink = async (m: Meeting): Promise<void> => {
    const href = joinHref(m, false);
    if (!href) {
      toast.error("This meeting has no link yet.");
      return;
    }
    await navigator.clipboard.writeText(href);
    toast.success("Meeting link copied");
  };

  const changeStatus = async (m: Meeting, status: Meeting["status"]) => {
    setBusy(true);
    const res = await setMeetingStatus(m.id, status);
    setBusy(false);
    if (res.ok) toast.success(status === "cancelled" ? "Meeting cancelled" : "Meeting updated");
    else toast.error(res.message ?? "You are not allowed to change this meeting.");
  };

  const rowProps = { user, join, copyLink, isAdmin, onCancel: setCancelTarget, onEnd: (m: Meeting) => void changeStatus(m, "completed") };

  return (
    <PortalShell
      portal={portal}
      title="Meetings"
      subtitle={
        portal === "client"
          ? "Schedule, join and manage all your meetings."
          : portal === "team"
            ? "Join and manage all team meetings."
            : "Schedule, manage and monitor all meetings across clients and teams."
      }
      actions={
        isAdmin ? (
          <Button onClick={() => setScheduleOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Schedule Meeting
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <KpiCard label="Total Meetings" value={all.length} icon={CalendarDays} tone="primary" caption="All time" />
            <KpiCard label="Live Now" value={live.length} icon={Radio} tone="success" caption="Live meetings" />
            <KpiCard label="Upcoming" value={upcoming.length} icon={CalendarClock} tone="info" caption="Scheduled" />
            <KpiCard label="Completed" value={completed.length} icon={CheckCircle2} tone="success" caption="All time" />
            <KpiCard label="Cancelled" value={cancelled.length} icon={XCircle} tone="destructive" caption="All time" />
          </div>

          {/* Upcoming */}
          <section className="surface-card overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5 sm:px-5">
              <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
                <span className="truncate">Upcoming Meetings</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {live.length + upcoming.length}
                </span>
              </h2>
            </header>

            {meetingsLoading ? (
              <div className="grid place-items-center gap-2 py-14 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading meetings…
              </div>
            ) : live.length + upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming meetings"
                body={isAdmin ? "Schedule a meeting to get started." : "You'll see meetings here as soon as they are scheduled."}
              />
            ) : portal === "admin" ? (
              <UpcomingTable meetings={[...live, ...upcoming]} {...rowProps} />
            ) : (
              <ul className="divide-y divide-border/60">
                {[...live, ...upcoming].map((m, i) => (
                  <MeetingRow key={m.id} meeting={m} index={i} portal={portal} {...rowProps} />
                ))}
              </ul>
            )}
          </section>

          {/* Past & cancelled */}
          <section className="surface-card overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5 sm:px-5">
              <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
                <span className="truncate">Past &amp; Cancelled Meetings</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {past.length}
                </span>
              </h2>
            </header>
            {past.length === 0 ? (
              <EmptyState title="Nothing here yet" body="Completed and cancelled meetings will be listed here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium sm:px-5">Title</th>
                      {portal !== "client" && <th className="px-4 py-3 font-medium">Client / Project</th>}
                      <th className="px-4 py-3 font-medium">Date &amp; time</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Host</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((m) => (
                      <tr key={m.id} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-3 font-medium sm:px-5">{m.title}</td>
                        {portal !== "client" && (
                          <td className="px-4 py-3 text-muted-foreground">
                            {[m.clientName, m.project].filter(Boolean).join(" · ") || "—"}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {fmtDate(m.startsAt)} · {fmtTime(m.startsAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{m.durationMins} min</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.host}</td>
                        <td className="px-4 py-3">
                          <StatusChip status={m.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-6">
          <div className="surface-card p-4">
            <MiniCalendar meetings={all} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <Legend color="bg-success" label="Live" />
              <Legend color="bg-primary" label="Scheduled" />
              <Legend color="bg-success/60" label="Completed" />
              <Legend color="bg-destructive" label="Cancelled" />
            </div>
          </div>

          <div className="surface-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Quick Actions</h3>
            <div className="space-y-1.5 text-sm">
              {isAdmin && (
                <QuickAction icon={Plus} label="Schedule a meeting" onClick={() => setScheduleOpen(true)} />
              )}
              <QuickAction
                icon={Copy}
                label="Copy next meeting link"
                onClick={() => {
                  const next = live[0] ?? upcoming[0];
                  if (!next) {
                    toast.error("No upcoming meeting.");
                    return;
                  }
                  void copyLink(next);
                }}
              />
              <QuickAction
                icon={MonitorPlay}
                label="Join next meeting"
                onClick={() => {
                  const next = live[0] ?? upcoming[0];
                  if (!next) {
                    toast.error("No upcoming meeting.");
                    return;
                  }
                  join(next);
                }}
              />
            </div>
          </div>

          <div className="surface-card p-4">
            <h3 className="mb-1 text-sm font-semibold">Today&apos;s Meetings</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {todays.length === 0 ? "No meetings today" : `${todays.length} meeting${todays.length > 1 ? "s" : ""} today`}
            </p>
            <ul className="space-y-3">
              {todays.slice(0, 4).map((m) => (
                <li key={m.id} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", ICON_TONES[0])}>
                    <Video className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(m.startsAt)} · {m.durationMins} min
                    </p>
                  </div>
                  <StatusChip status={m.status} />
                </li>
              ))}
            </ul>
          </div>

          <div className="surface-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Recent Meetings</h3>
            {past.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {past.slice(0, 4).map((m) => (
                  <li key={m.id} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                        m.status === "cancelled" ? ICON_TONES[4] : ICON_TONES[2],
                      )}
                    >
                      {m.status === "cancelled" ? <XCircle className="h-4 w-4" /> : <CalendarCheck2 className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(m.startsAt)} · {fmtTime(m.startsAt)}
                      </p>
                    </div>
                    <StatusChip status={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {isAdmin && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          clients={clients}
          users={portalUsers.filter((u) => u.id !== user?.id)}
          onCreate={createMeeting}
        />
      )}

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.title} will be cancelled, the Zoom link removed and everyone invited will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep meeting</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                const target = cancelTarget;
                setCancelTarget(null);
                if (target) void changeStatus(target, "cancelled");
              }}
            >
              Cancel meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalShell>
  );
}

/* --------------------------------------------------------------- pieces */

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", color)} /> {label}
    </span>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center gap-1 px-6 py-14 text-center">
      <CalendarDays className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

interface RowProps {
  user: ReturnType<typeof useApp>["user"];
  join: (m: Meeting) => void;
  copyLink: (m: Meeting) => Promise<void>;
  isAdmin: boolean;
  onCancel: (m: Meeting) => void;
  onEnd: (m: Meeting) => void;
}

function RowMenu({ meeting, copyLink, isAdmin, onCancel, onEnd }: RowProps & { meeting: Meeting }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Meeting actions">
          <span className="text-lg leading-none">···</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void copyLink(meeting)}>
          <Link2 className="mr-2 h-4 w-4" /> Copy link
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => onEnd(meeting)}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark completed
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onCancel(meeting)}>
              <XCircle className="mr-2 h-4 w-4" /> Cancel meeting
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MeetingRow({
  meeting,
  index,
  portal,
  ...rest
}: RowProps & { meeting: Meeting; index: number; portal: Portal }) {
  const tone = ICON_TONES[index % ICON_TONES.length]!;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] lg:items-center lg:gap-4">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone)}>
        <Video className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{meeting.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {portal === "client"
            ? `with ${meeting.host}`
            : [meeting.clientName || "Internal", meeting.project].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground lg:col-span-1">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" /> {fmtDate(meeting.startsAt)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> {fmtTime(meeting.startsAt)} · {meeting.durationMins} min
        </span>
      </div>
      <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
        {meeting.status === "live" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold uppercase text-success">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Live
          </span>
        ) : (
          <span className="rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">
            {relativeDay(meeting.startsAt)}
          </span>
        )}
      </div>
      <div className="col-span-2 flex items-center justify-end gap-1.5 lg:col-span-1">
        <Button size="sm" onClick={() => rest.join(meeting)}>
          Join Meeting
        </Button>
        <RowMenu meeting={meeting} {...rest} />
      </div>
    </li>
  );
}

function UpcomingTable({ meetings, ...rest }: RowProps & { meetings: Meeting[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Client / Project</th>
            <th className="px-4 py-3 font-medium">Date &amp; time</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            <th className="px-4 py-3 font-medium">Host</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((m, i) => (
            <tr key={m.id} className="border-b border-border/40 last:border-0">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", ICON_TONES[i % ICON_TONES.length]!)}>
                    <Video className="h-4 w-4" />
                  </span>
                  <span className="font-medium">{m.title}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {[m.clientName || "Internal", m.project].filter(Boolean).join(" · ")}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {fmtDate(m.startsAt)}
                <br />
                {fmtTime(m.startsAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{m.durationMins} min</td>
              <td className="px-4 py-3 text-muted-foreground">{m.host}</td>
              <td className="px-4 py-3">
                <StatusChip status={m.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1.5">
                  <Button size="sm" onClick={() => rest.join(m)}>
                    Join
                  </Button>
                  <RowMenu meeting={m} {...rest} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- schedule */

function ScheduleDialog({
  open,
  onOpenChange,
  clients,
  users,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: ReturnType<typeof useApp>["clients"];
  users: ReturnType<typeof useApp>["portalUsers"];
  onCreate: ReturnType<typeof useApp>["createMeeting"];
}) {
  const [form, setForm] = useState({
    title: "",
    agenda: "",
    clientId: "",
    project: "",
    date: "",
    time: "",
    durationMins: 30,
  });
  const [participants, setParticipants] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const invitable = useMemo(
    () => users.filter((u) => u.role !== "client" || !form.clientId || u.clientId === form.clientId),
    [users, form.clientId],
  );

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (): Promise<void> => {
    const fail = (msg: string) => {
      toast.error(msg);
    };
    if (form.title.trim().length < 3) return fail("Add a meeting title (min 3 characters).");
    if (!form.date || !form.time) return fail("Pick a date and time.");
    if (participants.length === 0) return fail("Select at least one participant.");
    const startsAt = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(startsAt.getTime())) return fail("Invalid date/time.");
    if (startsAt.getTime() < Date.now()) return fail("Pick a start time in the future.");

    setSaving(true);
    const res = await onCreate({
      title: form.title.trim(),
      agenda: form.agenda.trim(),
      startsAt: startsAt.toISOString(),
      durationMins: Number(form.durationMins) || 30,
      participantIds: participants,
      project: form.project.trim(),
      clientId: form.clientId || null,
    });
    setSaving(false);
    if (!res.ok) return fail(res.message ?? "Could not schedule the meeting.");
    toast.success("Meeting scheduled and participants notified");
    setForm({ title: "", agenda: "", clientId: "", project: "", date: "", time: "", durationMins: 30 });
    setParticipants([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a meeting</DialogTitle>
          <DialogDescription>A Zoom link is generated on the server and shared with participants.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Title</Label>
            <Input id="m-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-agenda">Agenda</Label>
            <Textarea id="m-agenda" rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-client">Client</Label>
              <select
                id="m-client"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Internal (no client)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-project">Project</Label>
              <Input id="m-project" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-date">Date</Label>
              <Input id="m-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-time">Time</Label>
              <Input id="m-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-dur">Duration (min)</Label>
              <Input
                id="m-dur"
                type="number"
                min={15}
                max={480}
                step={15}
                value={form.durationMins}
                onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Participants ({participants.length})</Label>
            <ScrollArea className="h-44 rounded-md border border-border">
              <ul className="p-2">
                {invitable.length === 0 && <li className="p-2 text-sm text-muted-foreground">No users available.</li>}
                {invitable.map((u) => (
                  <li key={u.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                      <Checkbox checked={participants.includes(u.id)} onCheckedChange={() => toggle(u.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.role}
                          {u.company ? ` · ${u.company}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create meeting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
