/**
 * Task email notifications (server-only) sent through Resend.
 *
 * Required secrets: RESEND_API_KEY and RESEND_FROM (a sender on your verified
 * custom domain, e.g. "Magsmen Portal <notifications@magsmen.com>"). Deliverability
 * relies on SPF/DKIM/DMARC being set for that domain in Resend.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import type { Database } from '@/integrations/supabase/types';

type TaskStatus = Database['public']['Enums']['task_status'];

export type NotifyKind = 'created' | 'assigned' | 'status';

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Completed',
  rejected: 'Rejected',
};

function esc(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function layout(heading: string, rows: Array<[string, string]>, intro: string) {
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#12141a">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px">
    <p style="font-size:18px;font-weight:700;margin:0 0 18px">Magsmen Portal</p>
    <h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>
    <p style="font-size:14px;line-height:22px;margin:0 0 18px">${esc(intro)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#5b6472;width:40%">${esc(k)}</td><td style="padding:8px 0;font-weight:600">${esc(v)}</td></tr>`,
        )
        .join('')}
    </table>
    <p style="font-size:13px;color:#5b6472;line-height:20px;margin:22px 0 0">
      You can view the full status history any time in your Magsmen Portal client portal.
    </p>
  </div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['RESEND_FROM'];
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY / RESEND_FROM missing — skipping send');
    return { sent: false, reason: 'not_configured' as const };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] Resend failed [${res.status}]: ${body}`);
    return { sent: false, reason: 'provider_error' as const };
  }
  return { sent: true as const };
}

/** Sends the client-facing email for a task event. Never throws. */
export async function notifyTaskEvent(taskId: string, kind: NotifyKind) {
  try {
    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('id, task_ref, title, status, assigned_to, client_id')
      .eq('id', taskId)
      .maybeSingle();
    if (!task || !task.client_id) return { sent: false, reason: 'no_task' as const };

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('company_name, user_id')
      .eq('id', task.client_id)
      .maybeSingle();
    if (!client) return { sent: false, reason: 'no_client' as const };

    const { data: clientUser } = await supabaseAdmin
      .from('users')
      .select('name, email')
      .eq('id', client.user_id)
      .maybeSingle();
    if (!clientUser?.email) return { sent: false, reason: 'no_email' as const };

    let assignee = 'Not assigned yet';
    if (task.assigned_to) {
      const { data: member } = await supabaseAdmin
        .from('team_members')
        .select('name, role_title')
        .eq('id', task.assigned_to)
        .maybeSingle();
      if (member) assignee = member.role_title ? `${member.name} (${member.role_title})` : member.name;
    }

    const statusLabel = STATUS_LABEL[task.status];
    const rows: Array<[string, string]> = [
      ['Task', task.title],
      ['Reference', task.task_ref],
      ['Status', statusLabel],
      ['Assigned to', assignee],
    ];

    let subject: string;
    let heading: string;
    let intro: string;

    if (kind === 'created') {
      subject = `Task received: ${task.title}`;
      heading = 'Your task has been received';
      intro = `Hello ${clientUser.name || client.company_name}, we have received your request and it is now in our queue.`;
    } else if (kind === 'assigned') {
      subject = `Task assigned: ${task.title}`;
      heading = 'Your task is now assigned to our team';
      intro = `Hello ${clientUser.name || client.company_name}, your task has been assigned and work is starting.`;
    } else {
      subject = `Task update: ${task.title} — ${statusLabel}`;
      heading = 'Status update on your task';
      intro = `Hello ${clientUser.name || client.company_name}, here is the latest update on your task.`;
    }

    return await sendEmail(clientUser.email, subject, layout(heading, rows, intro));
  } catch (e) {
    console.error('[email] notifyTaskEvent failed', e);
    return { sent: false, reason: 'error' as const };
  }
}
