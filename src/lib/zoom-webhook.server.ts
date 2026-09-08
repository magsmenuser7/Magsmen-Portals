/**
 * Zoom Event Notification handling (server-only).
 *
 * Shared by every mounted webhook path so the production endpoint and the
 * legacy endpoint behave identically. Zoom credentials never leave the server
 * runtime, and processing is idempotent: every delivery is keyed in
 * `zoom_webhook_events` first, so a retried webhook is acknowledged without
 * re-applying its effects.
 */
import { createHmac, timingSafeEqual } from 'crypto';

type ZoomPayload = {
  event?: string;
  event_ts?: number;
  payload?: {
    plainToken?: string;
    object?: {
      id?: string | number;
      uuid?: string;
      topic?: string;
      agenda?: string;
      start_time?: string;
      duration?: number;
      timezone?: string;
      join_url?: string;
      host_id?: string;
      participant?: { user_id?: string; user_name?: string; email?: string; join_time?: string; leave_time?: string };
    };
  };
};

function verifySignature(raw: string, signature: string | null, timestamp: string | null, secret: string) {
  if (!signature || !timestamp) return false;
  // Reject stale deliveries (>5 min) to blunt replay attempts.
  const ts = Number(timestamp) * 1000;
  if (Number.isFinite(ts) && Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex')}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleZoomWebhook(request: Request): Promise<Response> {
  const secret = process.env['ZOOM_WEBHOOK_SECRET_TOKEN'];
  if (!secret) {
    console.error('[zoom-webhook] ZOOM_WEBHOOK_SECRET_TOKEN is not configured');
    return new Response('Not configured', { status: 500 });
  }

  const raw = await request.text();
  let body: ZoomPayload;
  try {
    body = JSON.parse(raw) as ZoomPayload;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // 1) Endpoint URL validation challenge.
  if (body.event === 'endpoint.url_validation') {
    const plainToken = body.payload?.plainToken;
    if (!plainToken) return new Response('Missing plainToken', { status: 400 });
    const encryptedToken = createHmac('sha256', secret).update(plainToken).digest('hex');
    return Response.json({ plainToken, encryptedToken }, { status: 200 });
  }

  // 2) Every other event must carry a valid Zoom signature.
  if (
    !verifySignature(raw, request.headers.get('x-zm-signature'), request.headers.get('x-zm-request-timestamp'), secret)
  ) {
    console.warn('[zoom-webhook] rejected delivery with invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  const event = body.event ?? '';
  const obj = body.payload?.object ?? {};
  const zoomMeetingId = obj.id != null ? String(obj.id) : null;

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 3) Idempotency: a unique key per (event, meeting, ts, participant).
    const p = obj.participant;
    const eventKey = [
      event,
      zoomMeetingId ?? obj.uuid ?? 'unknown',
      body.event_ts ?? '',
      p?.user_id ?? p?.email ?? '',
      p?.join_time ?? p?.leave_time ?? '',
    ].join('|');

    const { error: dupeError } = await supabaseAdmin
      .from('zoom_webhook_events')
      .insert({ event_key: eventKey, event_type: event, zoom_meeting_id: zoomMeetingId, payload: body as never });
    if (dupeError) {
      // 23505 = already processed; acknowledge without re-applying.
      if (dupeError.code === '23505') return Response.json({ ok: true, duplicate: true });
      throw dupeError;
    }

    if (!zoomMeetingId) return Response.json({ ok: true, ignored: 'no meeting id' });

    const { data: meeting } = await supabaseAdmin
      .from('meetings')
      .select('id, title, status')
      .eq('zoom_meeting_id', zoomMeetingId)
      .maybeSingle();

    if (!meeting) {
      console.info(`[zoom-webhook] ${event} for unknown zoom meeting ${zoomMeetingId}`);
      return Response.json({ ok: true, ignored: 'unknown meeting' });
    }

    const stamp = new Date().toISOString();
    const base = { last_zoom_event: event, last_zoom_event_at: stamp, zoom_uuid: obj.uuid ?? null };

    switch (event) {
      case 'meeting.created':
      case 'meeting.updated': {
        await supabaseAdmin
          .from('meetings')
          .update({
            ...base,
            ...(obj.topic ? { title: obj.topic } : {}),
            ...(obj.agenda !== undefined ? { agenda: obj.agenda ?? '' } : {}),
            ...(obj.start_time ? { starts_at: new Date(obj.start_time).toISOString() } : {}),
            ...(obj.duration ? { duration_mins: obj.duration } : {}),
            ...(obj.timezone ? { timezone: obj.timezone } : {}),
            ...(obj.join_url ? { zoom_join_url: obj.join_url, link: obj.join_url } : {}),
          })
          .eq('id', meeting.id);
        break;
      }
      case 'meeting.started': {
        await supabaseAdmin
          .from('meetings')
          .update({ ...base, status: 'live', started_at: stamp })
          .eq('id', meeting.id)
          .neq('status', 'cancelled');
        await notifyParticipants(supabaseAdmin, meeting.id, `Meeting started: ${meeting.title}`, 'Join now.');
        break;
      }
      case 'meeting.ended': {
        await supabaseAdmin
          .from('meetings')
          .update({ ...base, status: 'completed', ended_at: stamp })
          .eq('id', meeting.id)
          .neq('status', 'cancelled');
        break;
      }
      case 'meeting.participant_joined':
      case 'meeting.participant_left': {
        const joined = event.endsWith('joined');
        const email = p?.email?.toLowerCase();
        if (email) {
          const { data: user } = await supabaseAdmin.from('users').select('id').ilike('email', email).maybeSingle();
          if (user) {
            await supabaseAdmin.from('meeting_participants').upsert(
              {
                meeting_id: meeting.id,
                user_id: user.id,
                ...(joined ? { joined_at: p?.join_time ?? stamp, left_at: null } : { left_at: p?.leave_time ?? stamp }),
              },
              { onConflict: 'meeting_id,user_id' },
            );
          }
        }
        await supabaseAdmin.from('meetings').update(base).eq('id', meeting.id);
        break;
      }
      default:
        return Response.json({ ok: true, ignored: event });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error(`[zoom-webhook] failed to process ${event}:`, error instanceof Error ? error.message : error);
    return new Response('Processing error', { status: 500 });
  }
}

type AdminClient = typeof import('@/integrations/supabase/client.server')['supabaseAdmin'];

/** One notification per participant per event — the idempotency key upstream prevents repeats. */
async function notifyParticipants(admin: AdminClient, meetingId: string, title: string, body: string) {
  const { data: parts } = await admin.from('meeting_participants').select('user_id').eq('meeting_id', meetingId);
  if (!parts?.length) return;
  await admin
    .from('notifications')
    .insert(parts.map((p) => ({ user_id: p.user_id, title, body, kind: 'meeting', meeting_id: meetingId })));
}
