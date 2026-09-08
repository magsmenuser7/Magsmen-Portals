import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/portal-shell";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import type { Portal } from "@/lib/types";

export const Route = createFileRoute("/portal/$portal/people")({
  head: () => ({
    meta: [
      { title: "People — Magsmen Portal" },
      { name: "description", content: "Workload and roles across the delivery team." },
      { property: "og:title", content: "People — Magsmen Portal" },
      { property: "og:description", content: "Team workload, roles and task ownership." },
    ],
  }),
  component: PeoplePage,
});

function PeoplePage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "team") as Portal;
  const { tasks, members } = useApp();

  // Hidden from the roster / users & roles list (commented out by request).
  const HIDDEN_PEOPLE = ["sandeep n"];

  const people = useMemo(() => {
    const map = new Map<
      string,
      { name: string; total: number; done: number; clients: Set<string> }
    >();
    for (const m of members) {
      map.set(m.name, { name: m.name, total: 0, done: 0, clients: new Set<string>() });
    }
    for (const t of tasks) {
      const row = map.get(t.assignee) ?? {
        name: t.assignee,
        total: 0,
        done: 0,
        clients: new Set<string>(),
      };
      row.total += 1;
      if (t.status === "completed") row.done += 1;
      row.clients.add(t.clientName);
      map.set(t.assignee, row);
    }
    return [...map.values()]
      .filter((p) => !HIDDEN_PEOPLE.includes(p.name.trim().toLowerCase()))
      .sort((a, b) => b.total - a.total);
  }, [tasks, members]);


  // PRIVACY: the internal team roster (names, roles, workload) is never shown
  // to clients. The component below is kept intact for team/admin use only.
  if (portal === "client") {
    return (
      <PortalShell portal={portal} title="Not available" subtitle="This section is internal to our delivery team">
        <div className="surface-card p-6 text-sm text-muted-foreground">
          The person handling your work is always shown on the task itself and in its activity history.
        </div>
      </PortalShell>
    );
  }


  return (
    <PortalShell
      portal={portal}
      title={portal === "admin" ? "Users & roles" : "My team"}
      subtitle="Workload distribution derived from live task data"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((p) => {
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          const member = members.find((m) => m.name === p.name);
          return (
            <div key={p.name} className="surface-card p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-primary-foreground"
                  style={{ backgroundColor: member?.color ?? "var(--primary)" }}
                >
                  {p.name.charAt(0)}
                  {member && (
                    <span
                      className={`absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-card ${
                        member.status === "online"
                          ? "bg-success"
                          : member.status === "away"
                            ? "bg-warning"
                            : "bg-muted-foreground"
                      }`}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member?.role ?? [...p.clients].join(", ")}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {p.done}/{p.total} completed
                </span>
                <span className="font-medium">{pct}%</span>
              </div>
              <Progress value={pct} className="mt-2" />
            </div>
          );
        })}
      </div>
    </PortalShell>
  );
}
