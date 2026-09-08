/**
 * Calling signalling foundation (no UI).
 *
 * Subscribes to Supabase Realtime for the signed-in user's calls (one-to-one
 * and group) and exposes the current call state plus the secure call actions.
 * Media never travels through Supabase — this channel carries signalling/state
 * only; LiveKit handles audio/video/screen once `joinToken()` returns a token.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  acceptCallFn,
  cancelCallFn,
  createCallFn,
  createGroupCallFn,
  declineCallFn,
  endCallFn,
  expireStaleCallsFn,
  getCallTokenFn,
  leaveCallFn,
  updateCallStateFn,
} from '@/lib/calls.functions';

export type CallStatus =
  | 'initiating'
  | 'ringing'
  | 'accepted'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'declined'
  | 'cancelled'
  | 'missed'
  | 'busy'
  | 'ended'
  | 'failed';

export type CallType = 'audio' | 'video' | 'screen_share';

export type ParticipantStatus =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'joined'
  | 'left'
  | 'missed'
  | 'failed';

export type CallSignalEvent =
  | 'call_initiated'
  | 'call_ringing'
  | 'call_accepted'
  | 'call_declined'
  | 'call_cancelled'
  | 'call_busy'
  | 'call_missed'
  | 'call_ended'
  | 'participant_joined'
  | 'participant_left'
  | 'participant_reconnecting';

export interface CallParticipant {
  userId: string;
  status: ParticipantStatus;
  isHost: boolean;
}

export interface CallRecord {
  id: string;
  tenantId: string | null;
  callerId: string;
  receiverId: string | null;
  channelId: string | null;
  isGroup: boolean;
  callType: CallType;
  status: CallStatus;
  roomName: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  createdAt: string;
}

const ACTIVE: CallStatus[] = [
  'initiating',
  'ringing',
  'accepted',
  'connecting',
  'connected',
  'reconnecting',
];

const EVENT_BY_STATUS: Record<CallStatus, CallSignalEvent> = {
  initiating: 'call_initiated',
  ringing: 'call_ringing',
  accepted: 'call_accepted',
  connecting: 'participant_joined',
  connected: 'participant_joined',
  reconnecting: 'participant_reconnecting',
  declined: 'call_declined',
  cancelled: 'call_cancelled',
  missed: 'call_missed',
  busy: 'call_busy',
  ended: 'call_ended',
  failed: 'participant_left',
};

type Row = {
  id: string;
  tenant_id: string | null;
  caller_id: string;
  receiver_id: string | null;
  channel_id: string | null;
  is_group: boolean | null;
  call_type: CallType;
  status: CallStatus;
  room_name: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
};

type ParticipantRow = {
  call_id: string;
  user_id: string;
  status: ParticipantStatus;
  is_host: boolean | null;
};

function mapRow(r: Row): CallRecord {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    callerId: r.caller_id,
    receiverId: r.receiver_id,
    channelId: r.channel_id,
    isGroup: Boolean(r.is_group),
    callType: r.call_type,
    status: r.status,
    roomName: r.room_name,
    answeredAt: r.answered_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds ?? 0,
    createdAt: r.created_at,
  };
}

const LIVE_PARTICIPANT: ParticipantStatus[] = ['ringing', 'accepted', 'joined'];

export function useCallSignaling(userId: string | null | undefined) {
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [lastEvent, setLastEvent] = useState<{ event: CallSignalEvent; call: CallRecord } | null>(null);
  const seen = useRef<Map<string, CallStatus>>(new Map());
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const apply = useCallback((row: Row) => {
    const call = mapRow(row);
    // Duplicate-event protection: same call id + same status is ignored.
    if (seen.current.get(call.id) === call.status) return;
    seen.current.set(call.id, call.status);
    setLastEvent({ event: EVENT_BY_STATUS[call.status], call });
    setActiveCall((prev) => {
      if (ACTIVE.includes(call.status)) return call;
      if (prev && prev.id === call.id) return null;
      return prev;
    });
  }, []);

  const loadParticipants = useCallback(async (callId: string) => {
    const { data } = await supabase
      .from('call_participants')
      .select('call_id, user_id, status, is_host')
      .eq('call_id', callId);
    setParticipants(
      ((data as ParticipantRow[] | null) ?? []).map((p) => ({
        userId: p.user_id,
        status: p.status,
        isHost: Boolean(p.is_host),
      })),
    );
  }, []);

  const loadCall = useCallback(
    async (callId: string) => {
      const { data } = await supabase.from('calls').select('*').eq('id', callId).maybeSingle();
      if (data) apply(data as Row);
    },
    [apply],
  );

  // Load any in-flight call once, then rely purely on realtime (no polling).
  useEffect(() => {
    if (!userId) {
      setActiveCall(null);
      setParticipants([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      // Resolve anything left ringing by a closed tab before trusting the row.
      try {
        await expireStaleCallsFn({});
      } catch {
        /* non-fatal: the row check below still applies */
      }
      const { data } = await supabase
        .from('calls')
        .select('*')
        .in('status', ACTIVE)
        .order('created_at', { ascending: false })
        .limit(1);
      const row = (data as Row[] | null)?.[0];
      if (!cancelled && row) apply(row);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, apply]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`calls:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `receiver_id=eq.${userId}` },
        (payload) => apply(payload.new as Row),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls', filter: `caller_id=eq.${userId}` },
        (payload) => apply(payload.new as Row),
      )
      // Group invitations arrive as a participant row for this user.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_participants', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as ParticipantRow | null;
          if (!row) return;
          if (LIVE_PARTICIPANT.includes(row.status)) void loadCall(row.call_id);
          else
            setActiveCall((prev) => {
              if (prev && prev.id === row.call_id) return null;
              return prev;
            });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, apply, loadCall]);

  // Keep the roster of a group call live for everyone on it.
  useEffect(() => {
    if (!activeCall?.isGroup) {
      setParticipants([]);
      return;
    }
    const callId = activeCall.id;
    void loadParticipants(callId);
    const channel = supabase
      .channel(`call-roster:${callId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_participants', filter: `call_id=eq.${callId}` },
        () => void loadParticipants(callId),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeCall?.id, activeCall?.isGroup, loadParticipants]);

  // Ring timeout: ask the server to resolve unanswered calls to `missed`.
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ringing') return;
    const t = setTimeout(() => {
      void expireStaleCallsFn({});
    }, 46_000);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [activeCall]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const actions = useMemo(
    () => ({
      start: (receiverId: string, callType: CallType = 'audio') =>
        createCallFn({ data: { receiverId, callType } }),
      startGroup: (channelId: string, callType: CallType = 'audio') =>
        createGroupCallFn({ data: { channelId, callType } }),
      accept: (callId: string) => acceptCallFn({ data: { callId } }),
      decline: (callId: string) => declineCallFn({ data: { callId } }),
      cancel: (callId: string) => cancelCallFn({ data: { callId } }),
      end: (callId: string) => endCallFn({ data: { callId } }),
      leave: (callId: string) => leaveCallFn({ data: { callId } }),
      setMediaState: (callId: string, status: 'connecting' | 'connected' | 'reconnecting' | 'failed') =>
        updateCallStateFn({ data: { callId, status } }),
      /** Short-lived LiveKit credentials for the current participant. */
      joinToken: (callId: string, roomName: string) => getCallTokenFn({ data: { callId, roomName } }),
    }),
    [],
  );

  const myParticipant = participants.find((p) => p.userId === userId) ?? null;

  const incoming = activeCall
    ? activeCall.isGroup
      ? activeCall.callerId !== userId && myParticipant?.status === 'ringing'
        ? activeCall
        : null
      : activeCall.receiverId === userId && activeCall.status === 'ringing'
        ? activeCall
        : null
    : null;

  const outgoing =
    activeCall && activeCall.callerId === userId && activeCall.status === 'ringing' ? activeCall : null;

  return { activeCall, participants, myParticipant, incoming, outgoing, lastEvent, ...actions };
}
