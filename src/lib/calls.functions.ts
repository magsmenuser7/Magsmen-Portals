/**
 * Call lifecycle server functions (Stage 1 backend).
 *
 * Every mutation validates the caller's bearer token via `requireSupabaseAuth`,
 * re-checks authorization in the database (`can_call_user`, tenant scoping),
 * enforces the call state machine, and only then writes through the service
 * role client. LiveKit credentials never leave the server.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  ACTIVE_STATUSES,
  CallError,
  RING_TIMEOUT_SECONDS,
  assertTransition,
  roomNameFor,
  type CallStatus,
  type CallType,
} from '@/lib/calls-state';

const idSchema = z.object({ callId: z.string().uuid() });

type CallRow = {
  id: string;
  tenant_id: string | null;
  caller_id: string;
  receiver_id: string | null;
  channel_id: string | null;
  is_group: boolean;
  call_type: CallType;
  status: CallStatus;
  room_name: string;
  answered_at: string | null;
  created_at: string;
};

type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

const CALL_COLUMNS =
  'id, tenant_id, caller_id, receiver_id, channel_id, is_group, call_type, status, room_name, answered_at, created_at';

async function loadCall(db: Admin, callId: string): Promise<CallRow> {
  const { data, error } = await db.from('calls').select(CALL_COLUMNS).eq('id', callId).maybeSingle();
  if (error) throw new CallError('Could not load the call.');
  if (!data) throw new CallError('Call not found.');
  return data as unknown as CallRow;
}

type ParticipantStatus = 'ringing' | 'accepted' | 'declined' | 'joined' | 'left' | 'missed' | 'failed';

async function participantOf(db: Admin, callId: string, userId: string) {
  const { data } = await db
    .from('call_participants')
    .select('call_id, user_id, status, is_host')
    .eq('call_id', callId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { status: ParticipantStatus; is_host: boolean } | null) ?? null;
}

/** Everyone who may be rung for a group conversation room. */
async function channelMembers(db: Admin, channelId: string): Promise<string[]> {
  const [{ data: rows }, { data: channel }] = await Promise.all([
    db.from('chat_participants').select('user_id').eq('channel_id', channelId),
    db.from('chat_channels').select('member_ids, kind').eq('id', channelId).maybeSingle(),
  ]);
  const ids = new Set<string>();
  (rows as { user_id: string }[] | null)?.forEach((r) => ids.add(r.user_id));
  ((channel as { member_ids: string[] | null } | null)?.member_ids ?? []).forEach((id) => ids.add(id));
  return [...ids];
}

/** Close a group call once nobody is left on it. */
async function closeGroupIfEmpty(db: Admin, call: CallRow) {
  if (!call.is_group) return;
  const { data } = await db
    .from('call_participants')
    .select('status')
    .eq('call_id', call.id)
    .in('status', ['ringing', 'accepted', 'joined']);
  if ((data?.length ?? 0) > 0) return;
  const startedFrom = call.answered_at ?? call.created_at;
  await db
    .from('calls')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      end_reason: 'everyone_left',
      duration_seconds: Math.max(0, Math.round((Date.now() - new Date(startedFrom).getTime()) / 1000)),
    })
    .eq('id', call.id)
    .in('status', ACTIVE_STATUSES);
}


/** Tenant (client account) a call belongs to; null for staff-to-staff calls. */
async function tenantFor(db: Admin, a: string, b: string): Promise<string | null> {
  const { data } = await db.from('clients').select('id, user_id').in('user_id', [a, b]);
  return data?.[0]?.id ?? null;
}

async function displayName(db: Admin, userId: string) {
  const { data } = await db.from('users').select('name, email').eq('id', userId).maybeSingle();
  return data?.name || data?.email || 'Participant';
}

async function notify(
  db: Admin,
  userId: string,
  title: string,
  body: string,
  callId: string,
) {
  await db.from('notifications').insert({
    user_id: userId,
    title,
    body,
    kind: 'call',
    link: `/calls/${callId}`,
  });
}

/** Sweep expired ringing calls so "missed" is authoritative server-side. */
async function sweep(db: Admin) {
  await db.rpc('expire_stale_calls', { _timeout_seconds: RING_TIMEOUT_SECONDS });
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export const createCallFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        receiverId: z.string().uuid(),
        callType: z.enum(['audio', 'video', 'screen_share']).default('audio'),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await sweep(db);

    if (data.receiverId === context.userId) throw new CallError('You cannot call yourself.');

    // Authorization runs as the signed-in user against the existing rules.
    const { data: allowed, error: authErr } = await context.supabase.rpc('can_call_user', {
      _caller: context.userId,
      _receiver: data.receiverId,
    });
    if (authErr || allowed !== true) throw new CallError('You are not allowed to call this person.');

    // Busy checks for both sides.
    const { data: callerBusy } = await db.rpc('has_active_call', { _user: context.userId });
    if (callerBusy === true) throw new CallError('You are already on a call.');
    const { data: receiverBusy } = await db.rpc('has_active_call', { _user: data.receiverId });

    const tenantId = await tenantFor(db, context.userId, data.receiverId);

    const callId = crypto.randomUUID();
    const status: CallStatus = receiverBusy === true ? 'busy' : 'ringing';

    const { data: row, error } = await db
      .from('calls')
      .insert({
        id: callId,
        tenant_id: tenantId,
        caller_id: context.userId,
        receiver_id: data.receiverId,
        call_type: data.callType,
        status,
        room_name: roomNameFor(callId),
        started_at: new Date().toISOString(),
        ...(status === 'busy' ? { ended_at: new Date().toISOString(), end_reason: 'busy' } : {}),
      })
      .select(CALL_COLUMNS)
      .single();
    if (error) throw new CallError('Could not start the call.');

    if (status === 'ringing') {
      const name = await displayName(db, context.userId);
      await notify(db, data.receiverId, `Incoming ${data.callType} call`, `${name} is calling you.`, callId);
    }

    return {
      callId: row.id,
      status: row.status as CallStatus,
      roomName: row.room_name,
      callType: row.call_type as CallType,
      ringTimeoutSeconds: RING_TIMEOUT_SECONDS,
    };
  });

/* ------------------------------------------------------------------ */
/* Group calls                                                         */
/* ------------------------------------------------------------------ */

export const createGroupCallFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        channelId: z.string().uuid(),
        callType: z.enum(['audio', 'video', 'screen_share']).default('audio'),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    await sweep(db);

    // Only members of the conversation may start a call in it.
    const { data: allowed } = await db.rpc('can_join_group_call', {
      _user: context.userId,
      _channel: data.channelId,
    });
    if (allowed !== true) throw new CallError('You are not a member of this conversation.');

    const { data: callerBusy } = await db.rpc('has_active_call', { _user: context.userId });
    if (callerBusy === true) throw new CallError('You are already on a call.');

    const members = (await channelMembers(db, data.channelId)).filter((id) => id !== context.userId);
    if (members.length === 0) throw new CallError('There is nobody else in this conversation.');

    const { data: channel } = await db
      .from('chat_channels')
      .select('client_id')
      .eq('id', data.channelId)
      .maybeSingle();

    const callId = crypto.randomUUID();
    const { error } = await db.from('calls').insert({
      id: callId,
      tenant_id: (channel as { client_id: string | null } | null)?.client_id ?? null,
      caller_id: context.userId,
      receiver_id: null,
      channel_id: data.channelId,
      is_group: true,
      call_type: data.callType,
      status: 'ringing',
      room_name: roomNameFor(callId),
      started_at: new Date().toISOString(),
    });
    if (error) throw new CallError('Could not start the group call.');

    const rows: {
      call_id: string;
      user_id: string;
      status: ParticipantStatus;
      is_host: boolean;
    }[] = [
      { call_id: callId, user_id: context.userId, status: 'accepted', is_host: true },
      ...members.map((id) => ({
        call_id: callId,
        user_id: id,
        status: 'ringing' as ParticipantStatus,
        is_host: false,
      })),
    ];
    const { error: pErr } = await db.from('call_participants').insert(rows);
    if (pErr) throw new CallError('Could not invite the group.');

    const name = await displayName(db, context.userId);
    await Promise.all(
      members.map((id) =>
        notify(db, id, `Incoming group ${data.callType} call`, `${name} started a group call.`, callId),
      ),
    );

    return {
      callId,
      status: 'ringing' as CallStatus,
      roomName: roomNameFor(callId),
      callType: data.callType as CallType,
      isGroup: true,
      participants: members.length + 1,
      ringTimeoutSeconds: RING_TIMEOUT_SECONDS,
    };
  });

/** Leave a group call without ending it for everyone else. */
export const leaveCallFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const call = await loadCall(db, data.callId);
    if (!call.is_group) throw new CallError('This is not a group call.');
    const me = await participantOf(db, call.id, context.userId);
    if (!me) throw new CallError('You are not part of this call.');

    await db
      .from('call_participants')
      .update({ status: 'left', left_at: new Date().toISOString() })
      .eq('call_id', call.id)
      .eq('user_id', context.userId);

    await closeGroupIfEmpty(db, call);
    return { callId: call.id, left: true };
  });


/* ------------------------------------------------------------------ */
/* Accept / decline / cancel / end                                     */
/* ------------------------------------------------------------------ */

export const acceptCallFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await sweep(db);
    const call = await loadCall(db, data.callId);

    if (call.is_group) {
      const me = await participantOf(db, call.id, context.userId);
      if (!me) throw new CallError('You are not invited to this call.');
      if (me.status !== 'accepted' && me.status !== 'joined') {
        if (me.status !== 'ringing') throw new CallError('This call is no longer available.');
        await db
          .from('call_participants')
          .update({ status: 'accepted', joined_at: new Date().toISOString() })
          .eq('call_id', call.id)
          .eq('user_id', context.userId);
      }
      if (call.status === 'ringing') {
        await db
          .from('calls')
          .update({ status: 'accepted', answered_at: call.answered_at ?? new Date().toISOString() })
          .eq('id', call.id)
          .eq('status', 'ringing');
      }
      return { callId: call.id, status: 'accepted' as CallStatus, roomName: call.room_name };
    }

    if (call.receiver_id !== context.userId) throw new CallError('Only the person called can accept.');
    if (call.status === 'accepted') {
      return { callId: call.id, status: 'accepted' as CallStatus, roomName: call.room_name };
    }
    assertTransition(call.status, 'accepted');

    const { error } = await db
      .from('calls')
      .update({ status: 'accepted', answered_at: new Date().toISOString() })
      .eq('id', call.id)
      .eq('status', call.status); // optimistic guard: ignores duplicate events
    if (error) throw new CallError('Could not accept the call.');

    return { callId: call.id, status: 'accepted' as CallStatus, roomName: call.room_name };
  });

export const declineCallFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const call = await loadCall(db, data.callId);

    if (call.is_group) {
      const me = await participantOf(db, call.id, context.userId);
      if (!me) throw new CallError('You are not invited to this call.');
      await db
        .from('call_participants')
        .update({ status: 'declined', left_at: new Date().toISOString() })
        .eq('call_id', call.id)
        .eq('user_id', context.userId);
      await closeGroupIfEmpty(db, call);
      return { callId: call.id, status: 'declined' as CallStatus };
    }

    if (call.receiver_id !== context.userId) throw new CallError('Only the person called can decline.');
    if (call.status === 'declined') return { callId: call.id, status: 'declined' as CallStatus };
    assertTransition(call.status, 'declined');

    await db
      .from('calls')
      .update({ status: 'declined', ended_at: new Date().toISOString(), end_reason: 'declined', ended_by: context.userId })
      .eq('id', call.id)
      .eq('status', call.status);

    return { callId: call.id, status: 'declined' as CallStatus };
  });


export const cancelCallFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const call = await loadCall(db, data.callId);
    if (call.caller_id !== context.userId) throw new CallError('Only the caller can cancel.');
    if (call.status === 'cancelled') return { callId: call.id, status: 'cancelled' as CallStatus };
    assertTransition(call.status, 'cancelled');

    await db
      .from('calls')
      .update({ status: 'cancelled', ended_at: new Date().toISOString(), end_reason: 'cancelled', ended_by: context.userId })
      .eq('id', call.id)
      .eq('status', call.status);

    return { callId: call.id, status: 'cancelled' as CallStatus };
  });

async function assertMember(db: Admin, call: CallRow, userId: string) {
  if (call.is_group) {
    if (!(await participantOf(db, call.id, userId))) throw new CallError('You are not part of this call.');
    return;
  }
  if (call.caller_id !== userId && call.receiver_id !== userId) {
    throw new CallError('You are not part of this call.');
  }
}

export const endCallFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const call = await loadCall(db, data.callId);
    await assertMember(db, call, context.userId);

    // In a group call only the host hangs up for everyone; others just leave.
    if (call.is_group && call.caller_id !== context.userId) {
      await db
        .from('call_participants')
        .update({ status: 'left', left_at: new Date().toISOString() })
        .eq('call_id', call.id)
        .eq('user_id', context.userId);
      await closeGroupIfEmpty(db, call);
      return { callId: call.id, status: 'ended' as CallStatus, left: true };
    }

    if (call.status === 'ended') return { callId: call.id, status: 'ended' as CallStatus };
    assertTransition(call.status, 'ended');

    const startedFrom = call.answered_at ?? call.created_at;
    const duration = Math.max(0, Math.round((Date.now() - new Date(startedFrom).getTime()) / 1000));

    await db
      .from('calls')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        ended_by: context.userId,
        end_reason: 'hangup',
        duration_seconds: duration,
      })
      .eq('id', call.id)
      .eq('status', call.status);

    if (call.is_group) {
      await db
        .from('call_participants')
        .update({ status: 'left', left_at: new Date().toISOString() })
        .eq('call_id', call.id)
        .in('status', ['ringing', 'accepted', 'joined']);
    }

    return { callId: call.id, status: 'ended' as CallStatus, durationSeconds: duration };
  });

/** Media-layer state reported by participants: connecting/connected/reconnecting. */
export const updateCallStateFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        callId: z.string().uuid(),
        status: z.enum(['connecting', 'connected', 'reconnecting', 'failed']),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const call = await loadCall(db, data.callId);
    await assertMember(db, call, context.userId);
    if (call.is_group && data.status === 'connected') {
      await db
        .from('call_participants')
        .update({ status: 'joined', joined_at: new Date().toISOString() })
        .eq('call_id', call.id)
        .eq('user_id', context.userId)
        .in('status', ['accepted', 'ringing']);
    }
    if (call.status === data.status) return { callId: call.id, status: call.status };
    assertTransition(call.status, data.status);
    await db.from('calls').update({ status: data.status }).eq('id', call.id).eq('status', call.status);
    return { callId: call.id, status: data.status as CallStatus };
  });


/* ------------------------------------------------------------------ */
/* LiveKit token                                                       */
/* ------------------------------------------------------------------ */

export const getCallTokenFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ callId: z.string().uuid(), roomName: z.string().min(1).max(120) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const call = await loadCall(db, data.callId);

    await assertMember(db, call, context.userId);
    if (call.room_name !== data.roomName) throw new CallError('Room mismatch.');
    if (!ACTIVE_STATUSES.includes(call.status)) throw new CallError('This call is no longer active.');

    if (call.is_group) {
      const me = await participantOf(db, call.id, context.userId);
      if (!me || (me.status !== 'accepted' && me.status !== 'joined')) {
        throw new CallError('Accept the call first.');
      }
      // Membership of the conversation can change; re-check before issuing media access.
      const { data: stillMember } = await db.rpc('can_join_group_call', {
        _user: context.userId,
        _channel: call.channel_id!,
      });
      if (stillMember !== true) throw new CallError('You are not allowed to join this call.');
    } else {
      if (call.status === 'ringing' || call.status === 'initiating') {
        // Only the caller may pre-join the room while it is still ringing.
        if (call.caller_id !== context.userId) throw new CallError('Accept the call first.');
      }

      // Re-check that the pairing is still allowed (roles/assignments can change).
      const { data: allowed } = await context.supabase.rpc('can_call_user', {
        _caller: call.caller_id,
        _receiver: call.receiver_id!,
      });
      if (allowed !== true) throw new CallError('You are not allowed to join this call.');
    }


    const { mintLiveKitToken, livekitUrl } = await import('@/lib/calls.server');
    const token = await mintLiveKitToken({
      identity: context.userId,
      name: await displayName(db, context.userId),
      room: call.room_name,
      callType: call.call_type,
    });

    return { url: livekitUrl(), token, roomName: call.room_name, callType: call.call_type };
  });

/** Client-triggered sweep so ringing calls resolve to `missed` without polling loops. */
export const expireStaleCallsFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const db = await admin();
    await sweep(db);
    return { ok: true };
  });
