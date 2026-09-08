import { supabase } from "@/integrations/supabase/client";
import type { ActivityItem, Meeting, SyncLogRow, Task, TeamMember } from "./types";

/**
 * Typed data-access layer for the Magsmen Portal backend (Lovable Cloud / PostgREST).
 * Every query below runs under Row Level Security, so results are already
 * scoped to the signed-in user's role (client / team / admin).
 */

const TASK_SELECT =
  "id, task_ref, title, description, status, priority, due_date, tags, clickup_task_id, created_at, updated_at, client_id, assigned_to, clients(company_name), team_members(name, role_title)";

interface TaskRow {
  id: string;
  task_ref: string;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  due_date: string | null;
  tags: string[] | null;
  clickup_task_id: string | null;
  created_at: string;
  updated_at: string;
  client_id: string | null;
  assigned_to: string | null;
  clients: { company_name: string } | null;
  team_members: { name: string; role_title: string } | null;
}

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    taskRef: row.task_ref,
    clientId: row.client_id,
    assignedTo: row.assigned_to,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    priority: row.priority,
    assignee: row.team_members?.name ?? "Unassigned",
    clientName: row.clients?.company_name ?? "—",
    dueDate: row.due_date ?? row.created_at.slice(0, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: row.tags ?? [],
    clickupId: row.clickup_task_id,
    syncedAt: null,
  };
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as TaskRow[]).map(mapTask);
}

export async function fetchTaskById(id: string): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapTask(data as unknown as TaskRow) : null;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("id, name, email, phone, role_title, user_id, is_super_admin")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const palette = ["#12a594", "#4f7df3", "#e0912f", "#d1495b", "#7b5ea7", "#2f8f5b"];
  return (data ?? []).map((m, i) => ({
    id: m.id,
    name: m.name,
    role: m.role_title || "Team Member",
    email: m.email,
    ...(m.phone ? { phone: m.phone } : {}),
    isSuperAdmin: m.is_super_admin,
    ...(m.user_id ? { userId: m.user_id } : {}),
    portal: "team" as const,
    status: m.user_id ? ("online" as const) : ("offline" as const),
    color: palette[i % palette.length]!,
  }));
}

interface ActivityRow {
  id: string;
  task_id: string;
  status: Task["status"] | null;
  changed_by_name: string;
  note: string;
  created_at: string;
  tasks: { title: string; client_id: string | null } | null;
}

export async function fetchActivity(): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("task_activity")
    .select("id, task_id, status, changed_by_name, note, created_at, tasks(title, client_id)")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return ((data ?? []) as unknown as ActivityRow[]).map((a) => ({
    id: a.id,
    actor: a.changed_by_name || "System",
    action: a.note || "updated",
    target: a.tasks?.title ?? "a task",
    at: a.created_at,
    portal: "system" as const,
    status: a.status,
    taskId: a.task_id,
  }));
}

export async function fetchSyncLogs(): Promise<SyncLogRow[]> {
  const { data, error } = await supabase
    .from("clickup_sync_log")
    .select("id, task_id, clickup_task_id, sync_status, direction, last_synced_at, error_message, tasks(title)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string;
    task_id: string | null;
    clickup_task_id: string | null;
    sync_status: SyncLogRow["syncStatus"];
    direction: string;
    last_synced_at: string | null;
    error_message: string | null;
    tasks: { title: string } | null;
  }>).map((r) => ({
    id: r.id,
    taskId: r.task_id,
    taskTitle: r.tasks?.title ?? "—",
    clickupTaskId: r.clickup_task_id,
    syncStatus: r.sync_status,
    direction: r.direction,
    lastSyncedAt: r.last_synced_at,
    errorMessage: r.error_message,
  }));
}

export interface ClientRecord {
  id: string;
  companyName: string;
  createdAt: string;
}

export async function fetchClients(): Promise<ClientRecord[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, company_name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    companyName: c.company_name || "Unnamed client",
    createdAt: c.created_at,
  }));
}

export async function logActivity(input: {
  taskId: string;
  status: Task["status"] | null;
  note: string;
  actorName: string;
  actorId?: string | null;
}) {
  await supabase.from("task_activity").insert({
    task_id: input.taskId,
    status: input.status,
    note: input.note,
    changed_by_name: input.actorName,
    changed_by: input.actorId ?? null,
  });
}

export interface ChatContact {
  userId: string;
  name: string;
  email: string;
  role: "client" | "team" | "admin";
  company: string;
}

/** People the signed-in user is allowed to start a private conversation with. */
export async function fetchChatDirectory(): Promise<ChatContact[]> {
  const { data, error } = await supabase.rpc("chat_directory");
  if (error) throw error;
  return ((data ?? []) as Array<{ user_id: string; name: string; email: string; role: ChatContact["role"]; company: string | null }>).map(
    (r) => ({
      userId: r.user_id,
      name: r.name || r.email,
      email: r.email,
      role: r.role,
      company: r.company ?? "",
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Meetings                                                            */
/* ------------------------------------------------------------------ */

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: "client" | "team" | "admin";
  clientId: string | null;
  company: string;
}

/** Everyone an admin may invite: team/admin staff plus each client's users. */
export async function fetchPortalUsers(): Promise<PortalUser[]> {
  // PostgREST has no users→clients embed path, so fetch both and join client-side.
  const [usersRes, clientsRes] = await Promise.all([
    supabase.from("users").select("id, name, email, role").order("name", { ascending: true }),
    supabase.from("clients").select("id, user_id, company_name"),
  ]);
  if (usersRes.error) throw usersRes.error;
  if (clientsRes.error) throw clientsRes.error;
  const clientByUser = new Map(
    (clientsRes.data ?? []).map((c) => [c.user_id, { id: c.id, company: c.company_name }]),
  );
  return (usersRes.data ?? []).map((u) => ({
    id: u.id,
    name: u.name || u.email,
    email: u.email,
    role: u.role,
    clientId: clientByUser.get(u.id)?.id ?? null,
    company: clientByUser.get(u.id)?.company ?? "",
  }));
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  kind: string;
  meetingId: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, kind, meeting_id, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body ?? "",
    kind: n.kind,
    meetingId: n.meeting_id,
    link: n.link,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

export async function markNotificationsRead() {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

interface MeetingRow {
  id: string;
  title: string;
  agenda: string;
  starts_at: string;
  duration_mins: number;
  host_id: string | null;
  host_name: string;
  client_id: string | null;
  project: string;
  link: string;
  status: Meeting["status"];
  portals: string[] | null;
  attendee_ids: string[] | null;
  zoom_join_url: string | null;
  zoom_start_url: string | null;
  zoom_meeting_id: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  clients: { company_name: string } | null;
  meeting_participants: { user_id: string; role: string; response_status: string }[] | null;
}

export function mapMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    agenda: row.agenda ?? "",
    startsAt: row.starts_at,
    durationMins: row.duration_mins,
    host: row.host_name || "—",
    hostId: row.host_id,
    attendees: row.attendee_ids ?? [],
    link: row.link ?? "",
    status: row.status,
    portals: (row.portals ?? []) as Meeting["portals"],
    clientId: row.client_id,
    clientName: row.clients?.company_name ?? "",
    project: row.project ?? "",
    zoomJoinUrl: row.zoom_join_url,
    zoomStartUrl: row.zoom_start_url,
    zoomMeetingId: row.zoom_meeting_id,
    cancelledAt: row.cancelled_at,
    createdBy: row.created_by,
    participants: (row.meeting_participants ?? []).map((p) => ({
      userId: p.user_id,
      role: p.role,
      responseStatus: p.response_status,
    })),
  };
}

/** All meetings the signed-in user is allowed to see (RLS scoped). */
export async function fetchMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, title, agenda, starts_at, duration_mins, host_id, host_name, client_id, project, link, status, portals, attendee_ids, zoom_join_url, zoom_start_url, zoom_meeting_id, cancelled_at, created_by, clients(company_name), meeting_participants(user_id, role, response_status)",
    )
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as MeetingRow[]).map(mapMeeting);
}
