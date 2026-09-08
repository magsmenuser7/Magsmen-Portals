/**
 * Client-safe call constants and state machine (no secrets, no LiveKit SDK).
 */
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

/** Statuses that occupy a user (used for the busy check). */
export const ACTIVE_STATUSES: CallStatus[] = [
  'initiating',
  'ringing',
  'accepted',
  'connecting',
  'connected',
  'reconnecting',
];

export const TERMINAL_STATUSES: CallStatus[] = [
  'declined',
  'cancelled',
  'missed',
  'busy',
  'ended',
  'failed',
];

/** Allowed transitions. Anything not listed here is rejected server-side. */
const TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  initiating: ['ringing', 'cancelled', 'busy', 'failed'],
  ringing: ['accepted', 'declined', 'cancelled', 'missed', 'busy', 'failed'],
  accepted: ['connecting', 'connected', 'ended', 'failed'],
  connecting: ['connected', 'reconnecting', 'ended', 'failed'],
  connected: ['reconnecting', 'ended', 'failed'],
  reconnecting: ['connected', 'ended', 'failed'],
  declined: [],
  cancelled: [],
  missed: [],
  busy: [],
  ended: [],
  failed: [],
};

export function canTransition(from: CallStatus, to: CallStatus): boolean {
  if (from === to) return true; // idempotent re-delivery of the same event
  return (TRANSITIONS[from] ?? []).includes(to);
}

export class CallError extends Error {}

export function assertTransition(from: CallStatus, to: CallStatus) {
  if (!canTransition(from, to)) {
    throw new CallError(`This call is already ${from}.`);
  }
}

/** Seconds a call may ring before it is marked missed. */
export const RING_TIMEOUT_SECONDS = 45;

export function roomNameFor(callId: string) {
  return `magsmen-call-${callId}`;
}

