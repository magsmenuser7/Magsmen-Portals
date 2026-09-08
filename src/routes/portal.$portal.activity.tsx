import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  FileText,
  ListFilter,
  MessageSquare,
  RefreshCcw,
  UserPlus,
  XCircle,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import { cn } from "@/lib/utils";
import type { ActivityItem, Portal } from "@/lib/types";

export const Route = createFileRoute("/portal/$portal/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Magsmen Portal" },
      { name: "description", content: "A chronological feed of every task and sync event." },
      { property: "og:title", content: "Activity — Magsmen Portal" },
      { property: "og:description", content: "Audit trail of task and integration events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

type FilterKey = "all" | "status" | "assignments" | "comments" | "sync" | "meetings";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All Activities" },
  { key: "status", label: "Status changes" },
  { key: "assignments", label: "Assignments" },
  { key: "comments", label: "Comments" },
  { key: "sync", label: "ClickUp sync" },
  { key: "meetings", label: "Meetings" },
];

/** Visual identity (icon + colour) for a feed row, derived from the event text. */
function visual(a: ActivityItem) {
  const t = `${a.action} ${a.actor}`.toLowerCase();
  if (t.includes("reject") || t.includes("declin"))
    return { Icon: XCircle, cls: "bg-destructive text-white" };
  if (t.includes("complete") || t.includes("done"))
    return { Icon: CheckCircle2, cls: "bg-success text-white" };
  if (t.includes("comment")) return { Icon: MessageSquare, cls: "bg-info text-white" };
  if (t.includes("meeting")) return { Icon: CalendarDays, cls: "bg-primary text-primary-foreground" };
  if (t.includes("assign") || t.includes("member"))
    return { Icon: UserPlus, cls: "bg-warning text-warning-foreground" };
  if (t.includes("document") || t.includes("upload"))
    return { Icon: FileText, cls: "bg-success text-white" };
  if (t.includes("sync") || t.includes("clickup"))
    return { Icon: RefreshCcw, cls: "bg-chart-2 text-white" };
  if (t.includes("in review") || t.includes("in_progress") || t.includes("progress"))
    return { Icon: Circle, cls: "bg-primary text-primary-foreground" };
  return { Icon: Circle, cls: "bg-primary text-primary-foreground" };
}

function matches(a: ActivityItem, f: FilterKey) {
  const t = a.action.toLowerCase();
  switch (f) {
    case "status":
      return t.includes("status");
    case "assignments":
      return t.includes("assign") || t.includes("member");
    case "comments":
      return t.includes("comment");
    case "sync":
      return t.includes("sync") || a.actor.toLowerCase().includes("clickup");
    case "meetings":
      return t.includes("meeting");
    default:
      return true;
  }
}

function stamp(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "2-digit" })}, ${time}`;
}

function ActivityPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "client") as Portal;
  const { activity } = useApp();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const rows = useMemo(() => {
    let out = activity.filter((a) => matches(a, filter));
    if (range?.from) {
      const from = new Date(range.from);
      from.setHours(0, 0, 0, 0);
      const to = range.to ? new Date(range.to) : new Date(range.from);
      to.setHours(23, 59, 59, 999);
      out = out.filter((a) => {
        const t = new Date(a.at).getTime();
        return t >= from.getTime() && t <= to.getTime();
      });
    }
    return out;
  }, [activity, filter, range]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  const rangeLabel = useMemo(() => {
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
    if (range?.from) return range.to ? `${fmt(range.from)} – ${fmt(range.to)}` : fmt(range.from);
    return "Filter by date";
  }, [range]);

  function exportCsv() {
    const head = "When,Actor,Action,Target\n";
    const body = rows
      .map((r) => [new Date(r.at).toISOString(), r.actor, r.action, r.target].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pageButtons = useMemo(() => {
    const out: (number | "…")[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i <= 3 || i === totalPages || Math.abs(i - current) <= 1) out.push(i);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  }, [totalPages, current]);

  return (
    <PortalShell
      portal={portal}
      title="Activity"
      subtitle="Everything that happened, newest first"
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v as FilterKey);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-[170px] gap-2">
              <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-10 justify-start gap-2 px-3 font-normal",
                  !range?.from && "text-muted-foreground",
                )}
              >
                <span className="truncate">{rangeLabel}</span>
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) => {
                  setRange(r);
                  setPage(1);
                }}
                numberOfMonths={1}
                initialFocus
                className="p-3 pointer-events-auto"
              />
              {range?.from && (
                <div className="flex justify-end border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRange(undefined);
                      setPage(1);
                    }}
                  >
                    Clear dates
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="icon" className="h-10 w-10" onClick={exportCsv} aria-label="Export activity as CSV">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <section className="surface-card overflow-hidden p-0">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No activity to show.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((a) => {
              const { Icon, cls } = visual(a);
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-4 py-4 transition-colors hover:bg-muted/50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-6"
                >
                  <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", cls)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug break-words">
                      <span className="font-semibold">{a.actor}</span>{" "}
                      <span className="text-foreground/80">{a.action}</span>{" "}
                      <span className="font-semibold">{a.target}</span>
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      By {a.actor} • {a.target} • {a.portal}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground sm:hidden">{stamp(a.at)}</p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{stamp(a.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p className="text-xs text-muted-foreground">
          {rows.length === 0
            ? "Showing 0 activities"
            : `Showing ${start + 1} to ${Math.min(start + pageSize, rows.length)} of ${rows.length} activities`}
        </p>
        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageButtons.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === current ? "default" : "outline"}
                size="icon"
                className="h-9 w-9 text-xs"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            disabled={current >= totalPages}
            onClick={() => setPage(current + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </PortalShell>
  );
}
