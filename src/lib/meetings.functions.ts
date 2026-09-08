/**
 * Meeting lifecycle server functions.
 *
 * Every mutation is admin-only and enforced server-side: the caller's bearer
 * token is validated by `requireSupabaseAuth`, then the `is_admin()` database
 * check runs as that user. Zoom credentials stay in the server runtime.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const meetingSchema = z.object({
  title: z.string().trim().min(3).max(140),
  agenda: z.string().trim().max(2000).default(''),
  clientId: z.string().uuid().nullable().optional(),
  project: z.string().trim().max(120).default(''),
  startsAt: z.string().datetime({ offset: true }),
  durationMins: z.number().int().min(15).max(480),
  participantIds: z.array(z.string().uuid()).max(50).default([]),
  link: z.string().trim().max(500).optional(),
});

const updateSchema = meetingSchema.partial().extend({ id: z.string().uuid() });

class Forbidden extends Error {}

async function assertAdmin(context: { supabase: { rpc: (fn: 'is_admin') => Promise<{ data: unknown }> } }) {
  const { data } = await context.supabase.rpc('is_admin');
  if (data !== true) throw new Forbidden('Only admins can manage meetings.');
}

function fmt(startsAt: string) {
  return new Date(startsAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

export const createMeetingFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => meetingSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    if (new Date(data.startsAt).getTime() < Date.now() - 60_000) {
      throw new Error('Pick a start time in the future.');
    }

    // Duplicate guard: same title at the same time, still active.
    const { data: dupe } = await supabaseAdmin
      .from('meetings')
      .select('id')
      .eq('title', data.title)
      .eq('starts_at', data.startsAt)
      .neq('status', 'cancelled')
      .maybeSingle();
    if (dupe) throw new Error('A meeting with this title already exists at that time.');

    const { data: host } = await supabaseAdmin
      .from('users')
      .select('name, email')
      .eq('id', context.userId)
      .maybeSingle();

    const { createZoomMeeting } = await import('@/lib/zoom.server');
    const zoom = await createZoomMeeting({
      topic: data.title,
      agenda: data.agenda,
      startsAt: data.startsAt,
      durationMins: data.durationMins,
    });

    const { data: meeting, error } = await supabaseAdmin
      .from('meetings')
      .insert({
        title: data.title,
        agenda: data.agenda,
        starts_at: data.startsAt,
        duration_mins: data.durationMins,
        host_id: context.userId,
        host_name: host?.name || host?.email || 'Admin',
        client_id: data.clientId ?? null,
        project: data.project,
        link: zoom?.joinUrl ?? data.link ?? '',
        status: 'scheduled',
        portals: ['client', 'team', 'admin'],
        attendee_ids: data.participantIds,
        created_by: context.userId,
        zoom_meeting_id: zoom?.zoomMeetingId ?? null,
        zoom_join_url: zoom?.joinUrl ?? data.link ?? null,
        zoom_start_url: zoom?.startUrl ?? null,
        zoom_uuid: zoom?.zoomUuid ?? null,
        timezone: 'UTC',
      })
      .select('id')
      .single();
    if (error || !meeting) throw new Error(error?.message ?? 'Could not create the meeting.');

    const rows = [
      { meeting_id: meeting.id, user_id: context.userId, role: 'host', response_status: 'accepted' },
      ...data.participantIds
        .filter((id) => id !== context.userId)
        .map((id) => ({ meeting_id: meeting.id, user_id: id, role: 'attendee', response_status: 'invited' })),
    ];
    await supabaseAdmin.from('meeting_participants').upsert(rows, { onConflict: 'meeting_id,user_id' });

    const invitees = rows.filter((r) => r.user_id !== context.userId);
    if (invitees.length) {
      await supabaseAdmin.from('notifications').insert(
        invitees.map((r) => ({
          user_id: r.user_id,
          title: `Meeting scheduled: ${data.title}`,
          body: `${fmt(data.startsAt)} UTC · ${data.durationMins} min`,
          kind: 'meeting',
          meeting_id: meeting.id,
          link: zoom?.joinUrl ?? data.link ?? null,
        })),
      );
    }

    return { id: meeting.id, zoomConfigured: Boolean(zoom) };
  });

export const updateMeetingFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: existing } = await supabaseAdmin
      .from('meetings')
      .select('id, title, agenda, starts_at, duration_mins, zoom_meeting_id')
      .eq('id', data.id)
      .maybeSingle();
    if (!existing) throw new Error('Meeting not found.');

    const next = {
      title: data.title ?? existing.title,
      agenda: data.agenda ?? existing.agenda,
      startsAt: data.startsAt ?? existing.starts_at,
      durationMins: data.durationMins ?? existing.duration_mins,
    };

    if (existing.zoom_meeting_id) {
      const { updateZoomMeeting } = await import('@/lib/zoom.server');
      await updateZoomMeeting(existing.zoom_meeting_id, {
        topic: next.title,
        agenda: next.agenda,
        startsAt: next.startsAt,
        durationMins: next.durationMins,
      });
    }

    const { error } = await supabaseAdmin
      .from('meetings')
      .update({
        title: next.title,
        agenda: next.agenda,
        starts_at: next.startsAt,
        duration_mins: next.durationMins,
        ...(data.project !== undefined ? { project: data.project } : {}),
        ...(data.clientId !== undefined ? { client_id: data.clientId } : {}),
        ...(data.participantIds ? { attendee_ids: data.participantIds } : {}),
      })
      .eq('id', data.id);
    if (error) throw new Error(error.message);

    if (data.participantIds) {
      await supabaseAdmin
        .from('meeting_participants')
        .delete()
        .eq('meeting_id', data.id)
        .not('user_id', 'in', `(${[...data.participantIds, context.userId].join(',')})`);
      await supabaseAdmin.from('meeting_participants').upsert(
        data.participantIds.map((id) => ({
          meeting_id: data.id,
          user_id: id,
          role: id === context.userId ? 'host' : 'attendee',
        })),
        { onConflict: 'meeting_id,user_id' },
      );
    }

    const { data: parts } = await supabaseAdmin
      .from('meeting_participants')
      .select('user_id')
      .eq('meeting_id', data.id);
    const others = (parts ?? []).filter((p) => p.user_id !== context.userId);
    if (others.length) {
      await supabaseAdmin.from('notifications').insert(
        others.map((p) => ({
          user_id: p.user_id,
          title: `Meeting updated: ${next.title}`,
          body: `${fmt(next.startsAt)} UTC · ${next.durationMins} min`,
          kind: 'meeting',
          meeting_id: data.id,
        })),
      );
    }
    return { ok: true };
  });

export const setMeetingStatusFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(['scheduled', 'live', 'completed', 'cancelled']) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: existing } = await supabaseAdmin
      .from('meetings')
      .select('id, title, starts_at, zoom_meeting_id')
      .eq('id', data.id)
      .maybeSingle();
    if (!existing) throw new Error('Meeting not found.');

    const { error } = await supabaseAdmin
      .from('meetings')
      .update({
        status: data.status,
        cancelled_at: data.status === 'cancelled' ? new Date().toISOString() : null,
      })
      .eq('id', data.id);
    if (error) throw new Error(error.message);

    if (data.status === 'cancelled') {
      if (existing.zoom_meeting_id) {
        const { deleteZoomMeeting } = await import('@/lib/zoom.server');
        await deleteZoomMeeting(existing.zoom_meeting_id);
      }
      const { data: parts } = await supabaseAdmin
        .from('meeting_participants')
        .select('user_id')
        .eq('meeting_id', data.id);
      const others = (parts ?? []).filter((p) => p.user_id !== context.userId);
      if (others.length) {
        await supabaseAdmin.from('notifications').insert(
          others.map((p) => ({
            user_id: p.user_id,
            title: `Meeting cancelled: ${existing.title}`,
            body: `${fmt(existing.starts_at)} UTC`,
            kind: 'meeting',
            meeting_id: data.id,
          })),
        );
      }
    }
    return { ok: true };
  });

/** Attendee RSVP — anyone invited can set their own response. */
export const respondToMeetingFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), response: z.enum(['accepted', 'declined', 'invited']) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('meeting_participants')
      .update({ response_status: data.response })
      .eq('meeting_id', data.id)
      .eq('user_id', context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
