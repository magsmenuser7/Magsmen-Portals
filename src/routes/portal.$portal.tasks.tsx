import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { TaskDialog } from "@/components/task-dialog";
import { PriorityPill, StatusPill } from "@/components/pills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import { STATUS_LABEL, STATUS_ORDER, PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/types";
import type { Portal, Task } from "@/lib/types";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  status: fallback(z.string(), "all").default("all"),
  priority: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/portal/$portal/tasks")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Tasks — Magsmen Portal" },
      { name: "description", content: "Create, filter, edit and delete delivery tasks." },
      { property: "og:title", content: "Tasks — Magsmen Portal" },
      { property: "og:description", content: "Full task CRUD with filters and ClickUp sync state." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "client") as Portal;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { tasks, createTask, updateTask, deleteTask, syncClickup, clickup } = useApp();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ to: ".", search: { ...search, ...patch } });

  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (search.status !== "all" && t.status !== search.status) return false;
      if (search.priority !== "all" && t.priority !== search.priority) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q))
      );
    });
  }, [tasks, search]);

  const canWrite = portal !== "client" || true;

  return (
    <PortalShell
      portal={portal}
      title="Tasks"
      subtitle={`${filtered.length} of ${tasks.length} tasks`}
      actions={
        <>
          {clickup.connected && (
            <Button
              variant="outline"
              onClick={() => {
                const n = syncClickup();
                toast.success(`ClickUp sync complete · ${n} tasks reconciled`);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Sync
            </Button>
          )}
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        </>
      }
    >
      <div className="surface-card p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Input
            value={search.q}
            onChange={(e) => setSearch({ q: e.target.value })}
            placeholder="Filter by title, id, assignee, client or tag"
            maxLength={100}
          />
          <Select value={search.status} onValueChange={(v) => setSearch({ status: v })}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.priority} onValueChange={(v) => setSearch({ priority: v })}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {filtered.length === 0 && (
          <div className="surface-card p-10 text-center">
            <p className="text-sm text-muted-foreground">No tasks match these filters.</p>
          </div>
        )}

        {filtered.map((t) => (
          <article key={t.id} className="surface-card p-4 transition-shadow hover:shadow-lift">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{t.id}</span>
                  <StatusPill status={t.status} />
                  <PriorityPill priority={t.priority} />
                  {t.clickupId && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      ClickUp · {t.clickupId}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 truncate text-base font-semibold">{t.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.assignee} · {t.clientName} · due {new Date(t.dueDate).toLocaleDateString()}
                </p>
                {t.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={t.status}
                  onValueChange={async (v) => {
                    const status = v as Task["status"];
                    const updated = await updateTask(t.id, { status });
                    if (updated) toast.success(`Moved to ${STATUS_LABEL[status]}`);
                    else toast.error("Task status could not be updated");
                  }}
                >
                  <SelectTrigger className="hidden w-36 sm:flex">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Task actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(t);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setPendingDelete(t)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </article>
        ))}
      </div>

      {canWrite && (
        <TaskDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          task={editing}
          onSubmit={async (input) => {
            if (editing) {
              const updated = await updateTask(editing.id, input);
              if (updated) toast.success("Task updated");
              else toast.error("Task could not be updated");
            } else {
              await createTask(input);
              toast.success("Task created");
            }
          }}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title} will be removed permanently from the board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deleteTask(pendingDelete.id);
                setPendingDelete(null);
                toast.success("Task deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalShell>
  );
}
