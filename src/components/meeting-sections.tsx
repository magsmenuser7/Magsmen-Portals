import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, User, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Meeting, TeamMember } from "@/lib/types";

export const MEETING_STATUS_STYLE: Record<Meeting["status"], string> = {
  live: "bg-success/15 text-success",
  scheduled: "bg-primary/10 text-primary",
  completed: "bg-success/12 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow", "In 3 days" or a plain date for anything further out. */
export function relativeDay(iso: string) {
  const start = new Date(iso);
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const n = new Date();
  const b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const days = Math.round((a - b) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "Yesterday";
  return fmtDate(iso);
}

export function StatusPill({ status, className }: { status: Meeting["status"]; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        MEETING_STATUS_STYLE[status],
        className,
      )}
    >
      {status}
    </span>
  );
}

export function LivePill() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-success">
      <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
      Live
    </span>
  );
}

/** Overlapping initial avatars for a meeting's attendee list. */
export function AttendeeStack({
  meeting,
  members,
  max = 4,
}: {
  meeting: Meeting;
  members: TeamMember[];
  max?: number;
}) {
  const people = members.filter((m) => meeting.attendees.includes(m.id));
  const shown = people.slice(0, max);
  const rest = Math.max(people.length - shown.length, 0);
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <span
            key={p.id}
            title={p.name}
            className="grid h-7 w-7 place-items-center rounded-full border-2 border-card text-[11px] font-semibold text-primary-foreground"
            style={{ backgroundColor: p.color }}
          >
            {p.name.charAt(0)}
          </span>
        ))}
      </div>
      {rest > 0 && (
        <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          +{rest}
        </span>
      )}
    </div>
  );
}

export function MetaRow({ meeting, showTime = true }: { meeting: Meeting; showTime?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays className="h-4 w-4" /> {fmtDate(meeting.startsAt)}
      </span>
      {showTime && (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> {fmtTime(meeting.startsAt)} · {meeting.durationMins} min
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <User className="h-4 w-4" /> Host: {meeting.host}
      </span>
      {meeting.project ? (
        <span className="inline-flex items-center gap-1.5">
          Project:
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">{meeting.project}</span>
        </span>
      ) : null}
    </div>
  );
}

export function MeetingIcon({ tone = "primary" }: { tone?: "primary" | "success" | "info" | "warning" }) {
  const map = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    info: "bg-info/15 text-info",
    warning: "bg-warning/20 text-warning-foreground",
  } as const;
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", map[tone])}>
      <Video className="h-5 w-5" />
    </span>
  );
}

/** Compact month calendar highlighting days that have meetings. */
export function MiniCalendar({ meetings }: { meetings: Meeting[] }) {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + offset, 1);

  const marks = useMemo(() => {
    const set = new Set<string>();
    for (const m of meetings) set.add(new Date(m.startsAt).toDateString());
    return set;
  }, [meetings]);

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
  ];
  const today = new Date().toDateString();

  return (
    <div>
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setOffset((o) => o - 1)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setOffset((o) => o + 1)}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d}>{d.slice(0, 3)}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-xs">
        {cells.map((d, i) => {
          if (!d) return <span key={`e-${i}`} />;
          const isToday = d.toDateString() === today;
          const hasMeeting = marks.has(d.toDateString());
          return (
            <span key={d.toISOString()} className="relative py-1">
              <span
                className={cn(
                  "mx-auto grid h-7 w-7 place-items-center rounded-full",
                  isToday ? "bg-primary font-semibold text-primary-foreground" : "text-foreground",
                )}
              >
                {d.getDate()}
              </span>
              {hasMeeting && !isToday && (
                <span className="absolute inset-x-0 -bottom-0.5 mx-auto h-1 w-1 rounded-full bg-primary" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
