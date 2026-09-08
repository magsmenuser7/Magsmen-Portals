/**
 * Stage 2 calling experience.
 *
 * Renders every call state (outgoing, incoming, connected audio/video/screen,
 * ended) on top of the portal, driven entirely by the Stage 1 backend:
 * Supabase Realtime carries the signalling/state, LiveKit carries the media.
 * Nothing here is simulated — timers, tracks and statuses all come from the
 * real call record and the real LiveKit room.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  MoreVertical,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LocalVideoTrack, RemoteAudioTrack, RemoteVideoTrack, Room } from "livekit-client";
import { useCallSignaling, type CallRecord, type CallType } from "@/hooks/use-call-signaling";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export type UiCallState =
  | "idle"
  | "calling"
  | "ringing"
  | "incoming"
  | "accepted"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "declined"
  | "cancelled"
  | "busy"
  | "missed"
  | "ended"
  | "failed";

interface CallCenterValue {
  /** Current UI state, derived from the real call record. */
  state: UiCallState;
  call: CallRecord | null;
  busy: boolean;
  /** Place a call to another portal user. */
  startCall: (receiverId: string, callType: CallType, peerName?: string) => Promise<void>;
  /** Ring everyone in a group conversation. */
  startGroupCall: (channelId: string, callType: CallType) => Promise<void>;
  error: string | null;
}

const CallCenterContext = createContext<CallCenterValue | null>(null);

export function useCalls(): CallCenterValue {
  const ctx = useContext(CallCenterContext);
  if (!ctx) {
    return {
      state: "idle",
      call: null,
      busy: false,
      startCall: async () => {},
      startGroupCall: async () => {},
      error: null,
    };
  }
  return ctx;
}


/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function initialsOf(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  const a = parts[0];
  if (!a) return "?";
  const b = parts[1];
  return b ? `${a[0]}${b[0]}`.toUpperCase() : a.slice(0, 2).toUpperCase();
}

function clock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function typeLabel(t: CallType) {
  return t === "audio" ? "Audio call" : t === "video" ? "Video call" : "Screen share";
}

/** One remote person in the room (group calls render a grid of these). */
interface RemoteView {
  id: string;
  name: string;
  cam: RemoteVideoTrack | null;
  screen: RemoteVideoTrack | null;
  audio: RemoteAudioTrack | null;
}


/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function CallCenterProvider({ children }: { children: ReactNode }) {
  const { user, directory, channels, sendMessage, openDirectChannel } = useApp();
  const signalling = useCallSignaling(user?.id);
  const { activeCall, incoming, outgoing, lastEvent } = signalling;

  const [room, setRoom] = useState<Room | null>(null);
  const [tick, setTick] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [remoteCam, setRemoteCam] = useState<RemoteVideoTrack | null>(null);
  const [remoteScreen, setRemoteScreen] = useState<RemoteVideoTrack | null>(null);
  const [remoteAudio, setRemoteAudio] = useState<RemoteAudioTrack | null>(null);
  const [remotes, setRemotes] = useState<RemoteView[]>([]);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [ended, setEnded] = useState<{ label: string; duration: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const roomRef = useRef<Room | null>(null);
  const connectingFor = useRef<string | null>(null);
  const historyLogged = useRef<Set<string>>(new Set());
  const handledTerminal = useRef<Set<string>>(new Set());
  // The signalling object is rebuilt on every render; keep a stable handle so
  // effects do not re-run (and re-join LiveKit) on unrelated re-renders.
  const signalRef = useRef(signalling);
  signalRef.current = signalling;


  const nameFor = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return "Participant";
      if (userId === user?.id) return user?.name ?? "You";
      const contact = directory.find((d) => d.userId === userId);
      return contact?.name ?? peerNames[userId] ?? "Participant";
    },
    [directory, peerNames, user?.id, user?.name],
  );

  const groupChannel = activeCall?.channelId
    ? channels.find((c) => c.id === activeCall.channelId)
    : undefined;
  const peerId =
    activeCall && !activeCall.isGroup
      ? activeCall.callerId === user?.id
        ? activeCall.receiverId
        : activeCall.callerId
      : null;
  const peerName = activeCall?.isGroup
    ? (groupChannel?.name ?? "Group call")
    : nameFor(peerId);
  const isCaller = !!activeCall && activeCall.callerId === user?.id;

  /* -------- tear the LiveKit room down -------- */
  const teardown = useCallback(async () => {
    const r = roomRef.current;
    roomRef.current = null;
    connectingFor.current = null;
    setRoom(null);
    setRemoteCam(null);
    setRemoteScreen(null);
    setRemoteAudio(null);
    setRemotes([]);
    setRemoteJoined(false);
    setScreenOn(false);
    if (r) {
      try {
        await r.localParticipant.setMicrophoneEnabled(false);
        await r.localParticipant.setCameraEnabled(false);
        await r.localParticipant.setScreenShareEnabled(false);
      } catch {
        /* device already released */
      }
      await r.disconnect();
    }
  }, []);

  /* -------- connect to LiveKit once the call is accepted -------- */
  useEffect(() => {
    if (!activeCall || !user) return;
    const shouldJoin = ["accepted", "connecting", "connected", "reconnecting"].includes(activeCall.status);
    if (!shouldJoin) return;
    if (roomRef.current || connectingFor.current === activeCall.id) return;
    connectingFor.current = activeCall.id;

    const sig = signalRef.current;
    void (async () => {
      try {
        const creds = await sig.joinToken(activeCall.id, activeCall.roomName);

        const { Room: LKRoom, RoomEvent, Track } = await import("livekit-client");
        const r = new LKRoom({ adaptiveStream: true, dynacast: true });

        const refresh = () => setTick((t) => t + 1);
        const syncRemote = () => {
          const list: RemoteView[] = [];
          r.remoteParticipants.forEach((p) => {
            const view: RemoteView = {
              id: p.identity,
              name: p.name || p.identity,
              cam: null,
              screen: null,
              audio: null,
            };
            p.trackPublications.forEach((pub) => {
              const t = pub.track;
              if (!t) return;
              if (pub.source === Track.Source.Camera) view.cam = t as RemoteVideoTrack;
              if (pub.source === Track.Source.ScreenShare) view.screen = t as RemoteVideoTrack;
              if (pub.kind === Track.Kind.Audio) view.audio = t as RemoteAudioTrack;
            });
            list.push(view);
          });
          setRemotes(list);
          const first = list[0];
          setRemoteCam(first?.cam ?? null);
          setRemoteScreen(list.find((v) => v.screen)?.screen ?? null);
          setRemoteAudio(first?.audio ?? null);
          setRemoteJoined(list.length > 0);
        };


        r.on(RoomEvent.TrackSubscribed, syncRemote)
          .on(RoomEvent.TrackUnsubscribed, syncRemote)
          .on(RoomEvent.TrackMuted, refresh)
          .on(RoomEvent.TrackUnmuted, refresh)
          .on(RoomEvent.LocalTrackPublished, refresh)
          .on(RoomEvent.LocalTrackUnpublished, refresh)
          .on(RoomEvent.ParticipantConnected, syncRemote)
          .on(RoomEvent.ParticipantDisconnected, syncRemote)
          .on(RoomEvent.Reconnecting, () => {
            void sig.setMediaState(activeCall.id, "reconnecting");
          })
          .on(RoomEvent.Reconnected, () => {
            void sig.setMediaState(activeCall.id, "connected");
          });

        await sig.setMediaState(activeCall.id, "connecting");
        await r.connect(creds.url, creds.token);
        roomRef.current = r;
        setRoom(r);

        // Device problems (blocked permission, no microphone) must not drop the
        // call — the participant simply joins without that track.
        try {
          await r.localParticipant.setMicrophoneEnabled(true);
          setMicOn(true);
        } catch {
          setMicOn(false);
          setError("Microphone unavailable — check the browser permission.");
          setTimeout(() => setError(null), 5000);
        }
        if (creds.callType === "video") {
          try {
            await r.localParticipant.setCameraEnabled(true);
            setCamOn(true);
          } catch {
            setCamOn(false);
            setError("Camera unavailable — check the browser permission.");
            setTimeout(() => setError(null), 5000);
          }
        } else {
          setCamOn(false);
        }
        if (creds.callType === "screen_share") {
          try {
            await r.localParticipant.setScreenShareEnabled(true);
            setScreenOn(true);
          } catch {
            /* user dismissed the picker */
          }
        }
        syncRemote();
        await sig.setMediaState(activeCall.id, "connected");
      } catch (e) {
        connectingFor.current = null;
        const raw = e instanceof Error ? e.message : "";
        setError(
          /token|unauthorized|401/i.test(raw)
            ? "Calling service unavailable — media credentials rejected."
            : raw || "Could not connect the call.",
        );
        setTimeout(() => setError(null), 6000);
        void sig.setMediaState(activeCall.id, "failed");
        void teardown();
      }
    })();
  }, [activeCall, user, teardown]);


  /* -------- terminal states: clean up + call history + ended card -------- */
  useEffect(() => {
    if (!lastEvent || !user) return;
    const { call } = lastEvent;
    const terminal = ["declined", "cancelled", "missed", "busy", "ended", "failed"].includes(call.status);
    if (!terminal) return;
    // Duplicate-event / re-render protection: handle each ending exactly once.
    const eventKey = `${call.id}:${call.status}`;
    if (handledTerminal.current.has(eventKey)) return;
    handledTerminal.current.add(eventKey);

    void teardown();


    const label =
      call.status === "ended"
        ? "Call ended"
        : call.status === "declined"
          ? isCallerOf(call, user.id)
            ? "Call declined"
            : "Call declined"
          : call.status === "cancelled"
            ? "Call cancelled"
            : call.status === "missed"
              ? "Missed call"
              : call.status === "busy"
                ? "Line busy"
                : "Call failed";
    setEnded({ label, duration: call.status === "ended" ? call.durationSeconds : null });

    // Call history line in the existing conversation — logged once, by the caller.
    const key = `${call.id}:${call.status}`;
    if (call.callerId === user.id && !historyLogged.current.has(key) && call.status !== "failed") {
      historyLogged.current.add(key);
      const other = call.callerId === user.id ? call.receiverId : call.callerId;
      void (async () => {
        let channelId: string | null = null;
        if (call.isGroup) {
          channelId = call.channelId;
        } else if (other) {
          const existing = channels.find(
            (c) => c.kind === "direct" && c.members.includes(other) && c.members.includes(user.id),
          );
          channelId =
            existing?.id ?? (await openDirectChannel({ name: nameFor(other), userId: other })) ?? null;
        }
        if (!channelId) return;
        const kind = typeLabel(call.callType);
        const body =
          call.status === "ended"
            ? `${kind} · Duration ${clock(call.durationSeconds)}`
            : call.status === "missed"
              ? `Missed ${kind.toLowerCase()}`
              : call.status === "declined"
                ? `Declined ${kind.toLowerCase()}`
                : call.status === "busy"
                  ? `${kind} — line busy`
                  : `Cancelled ${kind.toLowerCase()}`;
        await sendMessage(channelId, `☎ ${body}`);
      })();
    }

  }, [lastEvent, user, teardown, channels, openDirectChannel, sendMessage, nameFor]);

  /* -------- auto-dismiss the ended/missed/declined card -------- */
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(() => setEnded(null), 4000);
    return () => clearTimeout(t);
  }, [ended]);

  useEffect(() => () => void teardown(), [teardown]);

  /* -------- browser notification for background tabs -------- */
  useEffect(() => {
    if (!incoming) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    let shown = false;
    const show = () => {
      if (shown || Notification.permission !== "granted") return;
      shown = true;
      const n = new Notification("Magsmen Portal", {
        body: `Incoming ${typeLabel(incoming.callType).toLowerCase()} from ${nameFor(incoming.callerId)}`,
        tag: incoming.id,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    };
    const maybeShow = () => {
      if (!document.hidden) return;
      if (Notification.permission === "default") void Notification.requestPermission().then(show);
      else show();
    };
    maybeShow();
    // Also notify when the user switches away while the call is still ringing.
    document.addEventListener("visibilitychange", maybeShow);
    return () => document.removeEventListener("visibilitychange", maybeShow);
  }, [incoming, nameFor]);


  /* -------- ringtone for the receiver -------- */
  useEffect(() => {
    if (!incoming || typeof window === "undefined") return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 520;
    osc.connect(gain);
    osc.start();
    const ring = () => {
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    };
    ring();
    const iv = window.setInterval(ring, 2200);
    return () => {
      window.clearInterval(iv);
      osc.stop();
      void ctx.close();
    };
  }, [incoming]);

  /* -------- resolve names for people outside the chat directory -------- */
  useEffect(() => {
    if (!peerId || directory.some((d) => d.userId === peerId) || peerNames[peerId]) return;
    void (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("users").select("name, email").eq("id", peerId).maybeSingle();
      if (data) setPeerNames((p) => ({ ...p, [peerId]: data.name || data.email }));
    })();
  }, [peerId, directory, peerNames]);

  /* -------- actions -------- */
  const startCall = useCallback(
    async (receiverId: string, callType: CallType) => {
      setError(null);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      try {
        await signalling.start(receiverId, callType);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the call.");
        setTimeout(() => setError(null), 4000);
      }
    },
    [signalling],
  );

  const startGroupCall = useCallback(
    async (channelId: string, callType: CallType) => {
      setError(null);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      try {
        await signalling.startGroup(channelId, callType);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the group call.");
        setTimeout(() => setError(null), 4000);
      }
    },
    [signalling],
  );

  const toggleMic = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !micOn;
    await r.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !camOn;
    await r.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }, [camOn]);

  const toggleScreen = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !screenOn;
    try {
      await r.localParticipant.setScreenShareEnabled(next);
      setScreenOn(next);
    } catch {
      setScreenOn(false);
    }
  }, [screenOn]);

  const state: UiCallState = useMemo(() => {
    if (!activeCall) return ended ? (ended.duration !== null ? "ended" : "idle") : "idle";
    if (activeCall.status === "ringing") return isCaller ? "calling" : "incoming";
    return activeCall.status as UiCallState;
  }, [activeCall, ended, isCaller]);

  const localCam =
    (room?.localParticipant.getTrackPublication(
      // Track.Source.Camera === "camera"
      "camera" as never,
    )?.videoTrack as LocalVideoTrack | undefined) ?? null;
  void tick; // re-render on LiveKit track events

  const value = useMemo<CallCenterValue>(
    () => ({ state, call: activeCall, busy: !!activeCall, startCall, startGroupCall, error }),
    [state, activeCall, startCall, startGroupCall, error],
  );

  const connected = ["accepted", "connecting", "connected", "reconnecting"].includes(activeCall?.status ?? "");
  const roster = signalling.participants;
  const liveCount = activeCall?.isGroup
    ? roster.filter((p) => ["accepted", "joined"].includes(p.status)).length
    : 2;

  return (
    <CallCenterContext.Provider value={value}>
      {children}

      {outgoing && (
        <OutgoingOverlay
          name={peerName}
          callType={outgoing.callType}
          isGroup={outgoing.isGroup}
          onCancel={() => void signalling.cancel(outgoing.id)}
        />
      )}

      {incoming && (
        <IncomingOverlay
          name={nameFor(incoming.callerId)}
          groupName={incoming.isGroup ? peerName : null}
          callType={incoming.callType}
          onAccept={() => void signalling.accept(incoming.id)}
          onDecline={() => void signalling.decline(incoming.id)}
        />
      )}

      {activeCall && connected && (
        <ConnectedOverlay
          call={activeCall}
          peerName={peerName}
          status={activeCall.status}
          micOn={micOn}
          camOn={camOn}
          screenOn={screenOn}
          speakerOn={speakerOn}
          remoteCam={remoteCam}
          remoteScreen={remoteScreen}
          remoteAudio={remoteAudio}
          remotes={remotes}
          liveCount={liveCount}
          remoteJoined={remoteJoined}
          localCam={localCam}
          onToggleMic={() => void toggleMic()}
          onToggleCam={() => void toggleCam()}
          onToggleScreen={() => void toggleScreen()}
          onToggleSpeaker={() => setSpeakerOn((v) => !v)}
          onEnd={() =>
            void (activeCall.isGroup && !isCaller
              ? signalling.leave(activeCall.id)
              : signalling.end(activeCall.id))
          }
        />
      )}


      {!activeCall && ended && <EndedOverlay label={ended.label} duration={ended.duration} />}

      {error && (
        <div className="fixed inset-x-0 bottom-6 z-[130] flex justify-center px-4">
          <div className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">{error}</div>
        </div>
      )}
    </CallCenterContext.Provider>
  );
}

function isCallerOf(call: CallRecord, userId: string) {
  return call.callerId === userId;
}

/* ------------------------------------------------------------------ */
/* Presentational pieces                                               */
/* ------------------------------------------------------------------ */

function Avatar({ name, size = "lg" }: { name: string; size?: "lg" | "xl" }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 font-bold text-white shadow-xl",
        size === "xl" ? "h-28 w-28 text-3xl" : "h-20 w-20 text-2xl",
      )}
    >
      {initialsOf(name)}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
      {children}
    </div>
  );
}

function OutgoingOverlay({
  name,
  callType,
  isGroup,
  onCancel,
}: {
  name: string;
  callType: CallType;
  isGroup?: boolean;
  onCancel: () => void;
}) {
  return (
    <Shell>
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-white shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
          {isGroup ? "Ringing the group…" : "Calling…"}
        </p>
        <div className="mt-6 flex justify-center">
          <div className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30" />
            <Avatar name={name} size="xl" />
          </div>
        </div>
        <h3 className="mt-5 text-lg font-bold">{name}</h3>
        <p className="mt-1 text-xs text-slate-400">
          {typeLabel(callType)} · {isGroup ? "Waiting for people to join…" : "Calling…"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mx-auto mt-8 flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-700"
        >
          <PhoneOff className="h-4 w-4" /> Cancel
        </button>
      </div>
    </Shell>
  );
}

function IncomingOverlay({
  name,
  groupName,
  callType,
  onAccept,
  onDecline,
}: {
  name: string;
  groupName?: string | null;
  callType: CallType;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Shell>
      <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-white shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
          Incoming {groupName ? "group " : ""}
          {callType === "audio" ? "audio" : callType === "video" ? "video" : "screen share"} call
        </p>
        <div className="mt-6 flex justify-center">
          <div className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30" />
            <Avatar name={groupName || name} size="xl" />
          </div>
        </div>
        <h3 className="mt-5 text-lg font-bold">{groupName || name}</h3>
        <p className="mt-1 text-xs text-slate-400">
          {groupName ? `${name} started a group call…` : "is calling you…"}
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onDecline}
            className="flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-700"
          >
            <PhoneOff className="h-4 w-4" /> Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-600"
          >
            {callType === "audio" ? <Phone className="h-4 w-4" /> : <Video className="h-4 w-4" />} Accept
          </button>
        </div>
      </div>
    </Shell>
  );
}

function EndedOverlay({ label, duration }: { label: string; duration: number | null }) {
  return (
    <Shell>
      <div className="w-full max-w-xs rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-white shadow-2xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-600/20 text-rose-400">
          <PhoneOff className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-bold">{label}</h3>
        {duration !== null && <p className="mt-1 text-xs text-slate-400">Duration: {clock(duration)}</p>}
      </div>
    </Shell>
  );
}

function TrackView({
  track,
  className,
  mirror,
  muted,
}: {
  track: { attach: (el: HTMLMediaElement) => void; detach: (el: HTMLMediaElement) => void } | null;
  className?: string;
  mirror?: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted ?? true}
      className={cn("h-full w-full object-cover", mirror && "scale-x-[-1]", className)}
    />
  );
}

function AudioSink({ track, enabled }: { track: RemoteAudioTrack | null; enabled: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  useEffect(() => {
    if (ref.current) ref.current.muted = !enabled;
  }, [enabled]);
  return <audio ref={ref} autoPlay />;
}

function ControlButton({
  active,
  danger,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-12 w-12 place-items-center rounded-full text-white shadow-lg transition sm:h-14 sm:w-14",
        danger
          ? "bg-rose-600 hover:bg-rose-700"
          : active
            ? "bg-slate-700 hover:bg-slate-600"
            : "bg-rose-500/90 hover:bg-rose-600",
      )}
    >
      {children}
    </button>
  );
}

function ConnectedOverlay(props: {
  call: CallRecord;
  peerName: string;
  status: string;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  speakerOn: boolean;
  remoteCam: RemoteVideoTrack | null;
  remoteScreen: RemoteVideoTrack | null;
  remoteAudio: RemoteAudioTrack | null;
  remotes: RemoteView[];
  liveCount: number;
  remoteJoined: boolean;
  localCam: LocalVideoTrack | null;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen: () => void;
  onToggleSpeaker: () => void;
  onEnd: () => void;
}) {
  const {
    call,
    peerName,
    status,
    micOn,
    camOn,
    screenOn,
    speakerOn,
    remoteCam,
    remoteScreen,
    remoteAudio,
    remotes,
    liveCount,
    remoteJoined,
    localCam,
    onToggleMic,
    onToggleCam,
    onToggleScreen,
    onToggleSpeaker,
    onEnd,
  } = props;

  const [seconds, setSeconds] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    const base = call.answeredAt ? new Date(call.answeredAt).getTime() : Date.now();
    const iv = window.setInterval(() => setSeconds(Math.floor((Date.now() - base) / 1000)), 500);
    return () => window.clearInterval(iv);
  }, [call.answeredAt]);

  const isAudioOnly = call.callType === "audio";
  const stageTrack = remoteScreen ?? remoteCam;
  const isGroup = call.isGroup;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-950 text-white">
      {isGroup ? (
        remotes.map((rv) => <AudioSink key={rv.id} track={rv.audio} enabled={speakerOn} />)
      ) : (
        <AudioSink track={remoteAudio} enabled={speakerOn} />
      )}

      {/* header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Magsmen Portal</p>
          <p className="truncate text-[11px] text-slate-400">
            {peerName} · {typeLabel(call.callType)}
            {isGroup ? ` · ${liveCount} on the call` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status !== "connected" && (
            <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
              {status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
            </span>
          )}
          <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-xs text-slate-200">{clock(seconds)}</span>
        </div>
      </div>

      {/* stage */}
      <div className="relative flex-1 overflow-hidden px-3 pb-2 sm:px-6">
        <div className="relative h-full w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          {isGroup ? (
            remotes.length === 0 ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                <Avatar name={peerName} size="xl" />
                <p className="text-base font-semibold">{peerName}</p>
                <p className="text-xs text-slate-400">Waiting for people to join…</p>
              </div>
            ) : (
              <div
                className={cn(
                  "grid h-full w-full gap-2 p-2",
                  remotes.length === 1
                    ? "grid-cols-1"
                    : remotes.length <= 3
                      ? "grid-cols-1 sm:grid-cols-2"
                      : "grid-cols-2 lg:grid-cols-3",
                )}
              >
                {remotes.map((rv) => {
                  const track = rv.screen ?? rv.cam;
                  return (
                    <div
                      key={rv.id}
                      className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
                    >
                      {!isAudioOnly && track ? (
                        <TrackView track={track} />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-6">
                          <Avatar name={rv.name} />
                          <p className="text-xs text-slate-300">{rv.name}</p>
                        </div>
                      )}
                      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px]">
                        {rv.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          ) : !isAudioOnly && stageTrack ? (
            <TrackView track={stageTrack} />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <Avatar name={peerName} size="xl" />
              <p className="text-base font-semibold">{peerName}</p>
              <p className="text-xs text-slate-400">
                {!remoteJoined
                  ? "Waiting for them to join…"
                  : isAudioOnly
                    ? "Audio connected"
                    : "Camera off"}
              </p>
            </div>
          )}


          {screenOn && (
            <span className="absolute left-4 top-4 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold">
              You are sharing your screen
            </span>
          )}

          {/* self preview */}
          {!isAudioOnly && (
            <div className="absolute bottom-4 right-4 h-28 w-20 overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-xl sm:h-40 sm:w-28 md:h-44 md:w-32">
              {camOn && localCam ? (
                <TrackView track={localCam} mirror />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                  Camera off
                </div>
              )}
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[9px]">You</span>
            </div>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="relative flex items-center justify-center gap-3 px-4 py-4 sm:gap-4 sm:py-6">
        <ControlButton active={micOn} label={micOn ? "Mute" : "Unmute"} onClick={onToggleMic}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </ControlButton>

        {isAudioOnly ? (
          <ControlButton active={speakerOn} label={speakerOn ? "Speaker on" : "Speaker off"} onClick={onToggleSpeaker}>
            {speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </ControlButton>
        ) : (
          <ControlButton active={camOn} label={camOn ? "Stop video" : "Start video"} onClick={onToggleCam}>
            {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </ControlButton>
        )}

        <ControlButton active={!screenOn} label={screenOn ? "Stop sharing" : "Share screen"} onClick={onToggleScreen}>
          {screenOn ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
        </ControlButton>

        <ControlButton active label="More" onClick={() => setMoreOpen((v) => !v)}>
          <MoreVertical className="h-5 w-5" />
        </ControlButton>

        <button
          type="button"
          onClick={onEnd}
          aria-label="End call"
          className="flex h-12 items-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-700 sm:h-14 sm:px-7"
        >
          <PhoneOff className="h-5 w-5" />
          <span className="hidden sm:inline">End call</span>
        </button>

        {moreOpen && (
          <div className="absolute bottom-20 right-4 w-52 rounded-2xl border border-slate-700 bg-slate-900 p-2 text-xs shadow-2xl sm:right-1/4">
            <button
              type="button"
              onClick={() => {
                onToggleSpeaker();
                setMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-800"
            >
              {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {speakerOn ? "Mute speaker" : "Unmute speaker"}
            </button>
            <button
              type="button"
              onClick={() => {
                const el = document.documentElement;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void el.requestFullscreen();
                setMoreOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-800"
            >
              <Maximize2 className="h-4 w-4" /> Toggle full screen
            </button>
            <div className="mt-1 border-t border-slate-800 px-3 pt-2 text-[10px] text-slate-500">
              Room {call.roomName.slice(-8)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
