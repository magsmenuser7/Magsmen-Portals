/**
 * ClickUp two-way sync helpers (server-only).
 *
 * The app database is always the source of truth for the UI — every function
 * here logs its outcome into `clickup_sync_log` and never throws back into the
 * request path that triggered it.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { Database } from '@/integrations/supabase/types';

type TaskStatus = Database['public']['Enums']['task_status'];

const CLICKUP_API = 'https://api.clickup.com/api/v2';

export function clickupConfig() {
  return {
    token: process.env['CLICKUP_API_TOKEN'] ?? '',
    listId: process.env['CLICKUP_LIST_ID'] ?? '',
    webhookSecret: process.env['CLICKUP_WEBHOOK_SECRET'] ?? '',
  };
}

export function clickupConfigured() {
  const c = clickupConfig();
  return Boolean(c.token && c.listId);
}

/** Configurable status mapping, stored in `clickup_status_map` (admin editable). */
export async function statusMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('clickup_status_map').select('internal_status, clickup_status');
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.internal_status] = row.clickup_status;
  return map;
}

/**
 * Extra inbound-only aliases. ClickUp has 6 statuses, the portal 5, so
 * APPROVED collapses onto "In Progress" when coming back from ClickUp.
 */
const INBOUND_ALIASES: Record<string, TaskStatus> = {
  'new request': 'todo',
  'in progress': 'in_progress',
  'client review': 'in_review',
  approved: 'in_progress',
  completed: 'completed',
  declined: 'rejected',
};

export async function internalStatusFor(clickupStatus: string): Promise<TaskStatus | null> {
  const target = clickupStatus.trim().toLowerCase();
  const map = await statusMap();
  for (const [internal, external] of Object.entries(map)) {
    if (external.trim().toLowerCase() === target) return internal as TaskStatus;
  }
  return INBOUND_ALIASES[target] ?? null;
}

/* ------------------------------------------------------------------ */
/* User mapping — portal team member <-> ClickUp user, matched by email */
/* ------------------------------------------------------------------ */

/**
 * Some team members registered in ClickUp with a slightly different address
 * than their portal login (magsmen.in vs magsmen.com, etc.).
 */
const CLICKUP_EMAIL_ALIASES: Record<string, string[]> = {
  'vamsi@magsmenn.com': ['vamsi@magsmen.com'],
  'operations@gmail.com': ['operations@magsmen.com'],
  'digital@magsmen.com': ['digital@magsmen.in'],
  'growth@magsmen.com': ['growth@magsmen.in'],
};

export async function syncClickupUsers(): Promise<{
  ok: boolean;
  message: string;
  mapped: Array<{ email: string; name: string; clickupUserId: string }>;
  unmapped: string[];
}> {
  if (!clickupConfigured()) return { ok: false, message: 'ClickUp not configured', mapped: [], unmapped: [] };

  try {
    const teams = (await clickupFetch('/team', { method: 'GET' })) as {
      teams?: Array<{ id: string; members?: Array<{ user?: { id?: number; email?: string; username?: string } }> }>;
    };
    const clickupUsers = new Map<string, string>();
    for (const team of teams.teams ?? []) {
      for (const m of team.members ?? []) {
        if (m.user?.email && m.user.id != null) clickupUsers.set(m.user.email.trim().toLowerCase(), String(m.user.id));
      }
    }

    const { data: members } = await supabaseAdmin.from('team_members').select('id, name, email');
    const mapped: Array<{ email: string; name: string; clickupUserId: string }> = [];
    const unmapped: string[] = [];

    for (const member of members ?? []) {
      const primary = (member.email ?? '').trim().toLowerCase();
      const candidates = [primary, ...(CLICKUP_EMAIL_ALIASES[primary] ?? [])];
      const clickupUserId = candidates.map((e) => clickupUsers.get(e)).find(Boolean);
      if (!clickupUserId) {
        unmapped.push(member.email ?? member.name);
        continue;
      }
      await supabaseAdmin.from('team_members').update({ clickup_user_id: clickupUserId }).eq('id', member.id);
      mapped.push({ email: member.email, name: member.name, clickupUserId });
    }

    for (const email of unmapped) {
      await logSync({
        taskId: null,
        clickupTaskId: null,
        status: 'failed',
        direction: 'clickup_to_app',
        error: `unmapped assignee: no ClickUp account found for ${email}`,
      });
    }

    return { ok: true, message: `Mapped ${mapped.length} of ${(members ?? []).length} team members.`, mapped, unmapped };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unknown ClickUp error', mapped: [], unmapped: [] };
  }
}

async function logSync(input: {
  taskId: string | null;
  clickupTaskId: string | null;
  status: 'synced' | 'pending' | 'failed';
  direction: 'app_to_clickup' | 'clickup_to_app';
  error?: string | null;
}) {
  await supabaseAdmin.from('clickup_sync_log').insert({
    task_id: input.taskId,
    clickup_task_id: input.clickupTaskId,
    sync_status: input.status,
    direction: input.direction,
    last_synced_at: new Date().toISOString(),
    error_message: input.error ?? null,
  });
}

async function clickupFetch(path: string, init: RequestInit) {
  const { token } = clickupConfig();
  const res = await fetch(`${CLICKUP_API}${path}`, {
    ...init,
    headers: { Authorization: token, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${text.slice(0, 400)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** App -> ClickUp. Creates the ClickUp task on first push, updates it afterwards. */
export async function pushTaskToClickup(taskId: string): Promise<{ ok: boolean; message: string }> {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('id, title, description, status, priority, due_date, clickup_task_id, assigned_to, team_members(clickup_user_id, email, name)')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !task) return { ok: false, message: error?.message ?? 'Task not found' };

  if (!clickupConfigured()) {
    await logSync({
      taskId: task.id,
      clickupTaskId: task.clickup_task_id,
      status: 'pending',
      direction: 'app_to_clickup',
      error: 'ClickUp credentials not configured (CLICKUP_API_TOKEN / CLICKUP_LIST_ID).',
    });
    return { ok: false, message: 'ClickUp not configured' };
  }

  const assignee = (task as unknown as {
    team_members: { clickup_user_id: string | null; email: string; name: string } | null;
  }).team_members;

  // Unassigned tasks never reach ClickUp.
  if (!task.assigned_to) {
    await logSync({
      taskId: task.id,
      clickupTaskId: task.clickup_task_id,
      status: 'pending',
      direction: 'app_to_clickup',
      error: 'Task has no assignee — not pushed to ClickUp.',
    });
    return { ok: false, message: 'Task not assigned' };
  }

  if (assignee && !assignee.clickup_user_id) {
    await logSync({
      taskId: task.id,
      clickupTaskId: task.clickup_task_id,
      status: 'failed',
      direction: 'app_to_clickup',
      error: `unmapped assignee: ${assignee.email} has no linked ClickUp account`,
    });
  }

  const map = await statusMap();
  const clickupStatus = map[task.status];
  const priorityMap: Record<string, number> = { urgent: 1, high: 2, normal: 3, low: 4 };

  const body: Record<string, unknown> = {
    name: task.title,
    description: task.description ?? '',
    ...(clickupStatus ? { status: clickupStatus } : {}),
    priority: priorityMap[task.priority] ?? 3,
    ...(task.due_date ? { due_date: new Date(task.due_date).getTime() } : {}),
  };

  const clickupUserId = assignee?.clickup_user_id ? Number(assignee.clickup_user_id) : null;

  try {
    if (task.clickup_task_id) {
      await clickupFetch(`/task/${task.clickup_task_id}`, {
        method: 'PUT',
        body: JSON.stringify(clickupUserId ? { ...body, assignees: { add: [clickupUserId], rem: [] } } : body),
      });
      await logSync({
        taskId: task.id,
        clickupTaskId: task.clickup_task_id,
        status: 'synced',
        direction: 'app_to_clickup',
      });
      return { ok: true, message: 'updated' };
    }

    const { listId } = clickupConfig();
    const created = (await clickupFetch(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify(clickupUserId ? { ...body, assignees: [clickupUserId] } : body),
    })) as { id?: string };

    if (created.id) {
      await supabaseAdmin.from('tasks').update({ clickup_task_id: created.id }).eq('id', task.id);
    }
    await logSync({
      taskId: task.id,
      clickupTaskId: created.id ?? null,
      status: 'synced',
      direction: 'app_to_clickup',
    });
    return { ok: true, message: 'created' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown ClickUp error';
    await logSync({
      taskId: task.id,
      clickupTaskId: task.clickup_task_id,
      status: 'failed',
      direction: 'app_to_clickup',
      error: message,
    });
    return { ok: false, message };
  }
}

/** ClickUp -> App. Applies a webhook payload to the matching task. */
export async function applyClickupWebhook(payload: {
  event?: string;
  task_id?: string;
  history_items?: Array<{ field?: string; after?: unknown }>;
}): Promise<{ ok: boolean; message: string }> {
  const clickupTaskId = payload.task_id;
  if (!clickupTaskId) return { ok: false, message: 'Missing task_id' };

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id, status, title')
    .eq('clickup_task_id', clickupTaskId)
    .maybeSingle();

  if (!task) {
    await logSync({
      taskId: null,
      clickupTaskId,
      status: 'failed',
      direction: 'clickup_to_app',
      error: 'No matching task in Magsmen Portal for this ClickUp task id.',
    });
    return { ok: false, message: 'No matching task' };
  }

  try {
    const patch: { status?: TaskStatus; title?: string; description?: string } = {};
    for (const item of payload.history_items ?? []) {
      if (item.field === 'status') {
        const after = item.after as { status?: string } | string | undefined;
        const raw = typeof after === 'string' ? after : after?.status;
        if (raw) {
          const internal = await internalStatusFor(raw);
          if (internal) patch.status = internal;
        }
      }
      if (item.field === 'assignee_add') {
        const after = item.after as { email?: string } | undefined;
        const email = after?.email?.trim().toLowerCase();
        if (email) {
          const { data: member } = await supabaseAdmin
            .from('team_members')
            .select('id')
            .ilike('email', email)
            .maybeSingle();
          if (!member) {
            await logSync({
              taskId: task.id,
              clickupTaskId,
              status: 'failed',
              direction: 'clickup_to_app',
              error: `unmapped assignee: ClickUp user ${email} has no portal team member`,
            });
          }
        }
      }
      if (item.field === 'name' && typeof item.after === 'string') patch.title = item.after;
      if (item.field === 'content' && typeof item.after === 'string') patch.description = item.after;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from('tasks').update(patch).eq('id', task.id);
      if (error) throw new Error(error.message);
      if (patch.status) {
        await supabaseAdmin.from('task_activity').insert({
          task_id: task.id,
          status: patch.status,
          changed_by_name: 'ClickUp',
          note: `changed status to ${patch.status.replace('_', ' ')} from ClickUp`,
        });
      }
    }

    await logSync({
      taskId: task.id,
      clickupTaskId,
      status: 'synced',
      direction: 'clickup_to_app',
    });
    return { ok: true, message: 'applied' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    await logSync({
      taskId: task.id,
      clickupTaskId,
      status: 'failed',
      direction: 'clickup_to_app',
      error: message,
    });
    return { ok: false, message };
  }
}

/** Registers (or updates) the ClickUp webhook that points back at this app. */
export async function registerClickupWebhook(
  endpoint: string,
): Promise<{ ok: boolean; message: string; webhookId?: string; events?: string[]; teamId?: string }> {
  if (!clickupConfigured()) return { ok: false, message: 'ClickUp not configured (CLICKUP_API_TOKEN / CLICKUP_LIST_ID).' };

  const { listId } = clickupConfig();
  const events = ['taskCreated', 'taskUpdated', 'taskStatusUpdated', 'taskAssigneeUpdated'];

  try {
    const teams = (await clickupFetch('/team', { method: 'GET' })) as { teams?: Array<{ id: string }> };
    const teamId = teams.teams?.[0]?.id;
    if (!teamId) return { ok: false, message: 'No ClickUp workspace (team) found for this API token.' };

    const existing = (await clickupFetch(`/team/${teamId}/webhook`, { method: 'GET' })) as {
      webhooks?: Array<{ id: string; endpoint: string }>;
    };
    const match = existing.webhooks?.find((w) => w.endpoint === endpoint);

    const body = JSON.stringify({ endpoint, events, list_id: Number(listId) || listId });

    if (match) {
      await clickupFetch(`/webhook/${match.id}`, {
        method: 'PUT',
        body: JSON.stringify({ endpoint, events, status: 'active' }),
      });
      return { ok: true, message: 'Webhook already existed — updated it.', webhookId: match.id, events, teamId };
    }

    const created = (await clickupFetch(`/team/${teamId}/webhook`, { method: 'POST', body })) as {
      id?: string;
      webhook?: { id?: string; events?: string[] };
    };
    const webhookId = created.webhook?.id ?? created.id;
    if (!webhookId) return { ok: false, message: 'ClickUp did not return a webhook id.' };

    return { ok: true, message: 'Webhook registered with ClickUp.', webhookId, events: created.webhook?.events ?? events, teamId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unknown ClickUp error' };
  }
}
