import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Link2, RefreshCw, Users, Webhook, XCircle } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import type { Portal } from "@/lib/types";


export const Route = createFileRoute("/portal/$portal/integrations")({
  head: () => ({
    meta: [
      { title: "ClickUp Sync — Magsmen Portal" },
      { name: "description", content: "Manage the two-way ClickUp integration and sync history." },
      { property: "og:title", content: "ClickUp Sync — Magsmen Portal" },
      { property: "og:description", content: "Two-way task synchronisation with ClickUp." },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "team") as Portal;
  const { clickup, tasks, syncLogs, toggleClickup, toggleAutoSync, syncClickup, retrySync } = useApp();
  const [registering, setRegistering] = useState(false);
  const [mapping, setMapping] = useState<{ ok: boolean; message: string; mapped?: Array<{ email: string; name: string; clickupUserId: string }>; unmapped?: string[] } | null>(null);
  const [mappingUsers, setMappingUsers] = useState(false);
  const [webhook, setWebhook] = useState<{ ok: boolean; message: string; webhookId?: string; events?: string[]; endpoint?: string } | null>(null);

  const registerWebhook = async () => {
    setRegistering(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/public/clickup/register-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
      });
      const json = (await res.json()) as { ok: boolean; message: string; webhookId?: string; events?: string[]; endpoint?: string };
      setWebhook(json);
      if (json.ok) toast.success(`Webhook registered · ${json.webhookId}`);
      else toast.error(json.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Registration failed";
      setWebhook({ ok: false, message });
      toast.error(message);
    } finally {
      setRegistering(false);
    }
  };

  const mapUsers = async () => {
    setMappingUsers(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/public/clickup/map-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
      });
      const json = (await res.json()) as { ok: boolean; message: string; mapped?: Array<{ email: string; name: string; clickupUserId: string }>; unmapped?: string[] };
      setMapping(json);
      if (json.ok) toast.success(json.message);
      else toast.error(json.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "User mapping failed";
      setMapping({ ok: false, message });
      toast.error(message);
    } finally {
      setMappingUsers(false);
    }
  };

  const linked = tasks.filter((t) => t.clickupId).length;


  // ClickUp sync is internal-only — never surface it in the Client Portal.
  if (portal === "client") {
    return (
      <PortalShell portal={portal} title="Not available" subtitle="This section is internal to our delivery team">
        <div className="surface-card p-6 text-sm text-muted-foreground">
          Integration tooling is managed by the Magsmen Portal delivery team.
        </div>
      </PortalShell>
    );
  }

  const latestByTask = new Map<string, (typeof syncLogs)[number]>();
  for (const log of syncLogs) {
    if (log.taskId && !latestByTask.has(log.taskId)) latestByTask.set(log.taskId, log);
  }

  return (
    <PortalShell
      portal={portal}
      title="ClickUp sync"
      subtitle="Two-way synchronisation between Magsmen Portal and your ClickUp workspace"
      actions={
        <Button
          disabled={!clickup.connected}
          onClick={async () => {
            const n = await syncClickup();
            toast.success(`Sync complete · ${n} tasks reconciled`);
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Sync now
        </Button>
      }
    >

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-gradient">
                <Link2 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{clickup.workspace}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {clickup.connected ? "Connected" : "Disconnected"} ·{" "}
                  {clickup.lastSync
                    ? `last sync ${new Date(clickup.lastSync).toLocaleString()}`
                    : "never synced"}
                </p>
              </div>
            </div>
            <Button variant={clickup.connected ? "outline" : "default"} onClick={toggleClickup}>
              {clickup.connected ? "Disconnect" : "Connect"}
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-xl border border-border p-4">
            <div>
              <Label htmlFor="auto">Automatic sync</Label>
              <p className="text-sm text-muted-foreground">Reconcile every 15 minutes.</p>
            </div>
            <Switch id="auto" checked={clickup.autoSync} onCheckedChange={toggleAutoSync} />
          </div>

          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <Label>Webhook registration</Label>
                <p className="text-sm text-muted-foreground">
                  Registers a ClickUp webhook via API for task created and status updated events.
                </p>
              </div>
              <Button variant="outline" disabled={registering} onClick={registerWebhook}>
                <Webhook className="mr-2 h-4 w-4" />
                {registering ? "Registering…" : "Register webhook"}
              </Button>
            </div>
            {webhook && (
              <div
                className={`mt-3 rounded-lg p-3 text-xs ${
                  webhook.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                }`}
              >
                <p className="font-medium">{webhook.message}</p>
                {webhook.webhookId && <p className="mt-1 break-all">Webhook ID: {webhook.webhookId}</p>}
                {webhook.events?.length ? <p className="break-all">Events: {webhook.events.join(", ")}</p> : null}
                {webhook.endpoint && <p className="break-all">Endpoint: {webhook.endpoint}</p>}
              </div>
            )}
          </div>


          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <Label>Team member mapping</Label>
                <p className="text-sm text-muted-foreground">
                  Links every portal team member to their ClickUp account by matching email addresses.
                </p>
              </div>
              <Button variant="outline" disabled={mappingUsers} onClick={mapUsers}>
                <Users className="mr-2 h-4 w-4" />
                {mappingUsers ? "Mapping…" : "Map users"}
              </Button>
            </div>
            {mapping && (
              <div className={`mt-3 rounded-lg p-3 text-xs ${mapping.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                <p className="font-medium">{mapping.message}</p>
                {mapping.mapped?.map((m) => (
                  <p key={m.email} className="mt-1 break-all">
                    {m.name} · {m.email} → ClickUp #{m.clickupUserId}
                  </p>
                ))}
                {mapping.unmapped?.length ? (
                  <p className="mt-1 break-all">Unmapped: {mapping.unmapped.join(", ")}</p>
                ) : null}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Linked tasks", value: linked },
              { label: "Unlinked", value: tasks.length - linked },
              { label: "Direction", value: "Two-way" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-xl font-semibold">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-base font-semibold">Status mapping</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              ["NEW REQUEST", "Pending"],
              ["IN PROGRESS", "In Progress"],
              ["CLIENT REVIEW", "Pending Approval"],
              ["APPROVED", "In Progress"],
              ["COMPLETED", "Completed"],
              ["DECLINED", "Rejected"],
            ].map(([cu, portalStatus]) => (
              <li key={cu} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="truncate text-muted-foreground">{cu}</span>
                <span className="truncate font-medium">{portalStatus}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 text-base font-semibold">What syncs</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[
              ["Task title, description, tags", true],
              ["Status and priority mapping", true],
              ["Assignee mapping", true],
              ["Due dates", true],
              ["Attachments", false],
            ].map(([label, on]) => (
              <li key={String(label)} className="flex items-start gap-2">
                {on ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={on ? "" : "text-muted-foreground"}>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="surface-card mt-4 p-5">
        <h2 className="text-base font-semibold">Task sync status</h2>
        <p className="text-sm text-muted-foreground">
          Live per-task sync state. Failed pushes can be retried without touching the task itself.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Task</th>
                <th className="py-2 pr-4 font-medium">ClickUp ID</th>
                <th className="py-2 pr-4 font-medium">Sync status</th>
                <th className="py-2 pr-4 font-medium">Last synced</th>
                <th className="py-2 pr-4 font-medium">Error</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const log = latestByTask.get(t.id);
                const status = log?.syncStatus ?? (t.clickupId ? "synced" : "pending");
                const tone =
                  status === "synced"
                    ? "bg-success/10 text-success"
                    : status === "failed"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning";
                return (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[220px] truncate py-3 pr-4 font-medium">{t.title}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{t.clickupId ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{status}</span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {log?.lastSyncedAt ? new Date(log.lastSyncedAt).toLocaleString() : "—"}
                    </td>
                    <td className="max-w-[220px] truncate py-3 pr-4 text-xs text-destructive">
                      {log?.errorMessage ?? ""}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await retrySync(t.id);
                          toast.success("Retry sent to ClickUp");
                        }}
                      >
                        <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No tasks to sync yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PortalShell>
  );
}

