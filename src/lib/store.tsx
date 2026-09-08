import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { seedMembers } from "./seed-collab";
import {
  fetchActivity,
  fetchClients,
  fetchSyncLogs,
  fetchTaskById,
  fetchTasks,
  fetchTeamMembers,
  fetchChatDirectory,
  fetchMeetings,
  fetchNotifications,
  fetchPortalUsers,
  markNotificationsRead,
  logActivity,
} from "./api";
import type { ChatContact, ClientRecord, PortalUser } from "./api";
import {
  createMeetingFn,
  respondToMeetingFn,
  setMeetingStatusFn,
  updateMeetingFn,
} from "./meetings.functions";
import type {
  ActivityItem,
  AppNotification,
  AppUser,
  ChatChannel,
  ChatMessage,
  ChatMessageKind,
  ChatReaction,
  Meeting,
  Portal,
  SyncLogRow,
  Task,
  TeamMember,
} from "./types";

const COLORS = ["#4f7df3", "#12a594", "#e0912f", "#d1495b", "#7b5ea7"];
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const chatReadStorageKey = (userId: string) => `magsmen-chat-reads:${userId}`;

function readLocalChatReads(userId: string) {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const raw = window.localStorage.getItem(chatReadStorageKey(userId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {} as Record<string, string>;
  }
}

function writeLocalChatRead(userId: string, channelId: string, at: string) {
  if (typeof window === "undefined") return;
  const next = { ...readLocalChatReads(userId), [channelId]: at };
  window.localStorage.setItem(chatReadStorageKey(userId), JSON.stringify(next));
}

function latestIso(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  return +new Date(a) >= +new Date(b) ? a : b;
}

export interface TaskInput {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  assignee: string;
  clientName: string;
  dueDate: string;
  tags: string[];
}

export interface MeetingInput {
  title: string;
  agenda: string;
  startsAt: string;
  durationMins: number;
  /** auth user ids of invited participants */
  participantIds: string[];
  project?: string;
  clientId?: string | null;
}

export interface MutationResult {
  ok: boolean;
  message?: string;
}

interface AuthResult {
  ok: boolean;
  message: string;
}

interface Ctx {
  ready: boolean;
  user: AppUser | null;
  tasks: Task[];
  activity: ActivityItem[];
  notifications: AppNotification[];
  members: TeamMember[];
  clients: ClientRecord[];
  directory: ChatContact[];
  syncLogs: SyncLogRow[];
  clickup: { connected: boolean; workspace: string; lastSync: string | null; autoSync: boolean };
  signIn: (email: string, password: string, portal: Portal) => Promise<AuthResult>;
  signUp: (
    input: { name: string; email: string; password: string; company?: string; phone?: string },
    portal: Portal,
  ) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updateProfile: (input: { name: string; phone: string }) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, input: Partial<TaskInput>) => Promise<boolean>;
  deleteTask: (id: string) => Promise<void>;
  markAllRead: () => void;
  toggleClickup: () => void;
  toggleAutoSync: () => void;
  syncClickup: () => Promise<number>;
  retrySync: (taskId: string) => Promise<void>;
  channels: ChatChannel[];
  messages: ChatMessage[];
  meetings: Meeting[];
  sendMessage: (
    channelId: string,
    body: string,
    attachment?: {
      kind: ChatMessageKind;
      url: string;
      name: string;
      mime: string;
      size: number;
    },
  ) => Promise<void>;
  uploadChatFile: (file: File) => Promise<{ path: string; name: string; mime: string; size: number } | null>;
  toggleReaction: (messageId: string, channelId: string, emoji: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  renameChannel: (channelId: string, name: string) => Promise<void>;
  archiveChannel: (channelId: string, archived: boolean) => Promise<void>;
  markChannelRead: (channelId: string) => void;
  openDirectChannel: (member: { name: string; userId?: string }) => Promise<string | null>;
  createChannel: (
    name: string,
    memberIds: string[],
    options?: { roomType?: "client" | "task"; clientId?: string | null; description?: string | null },
  ) => Promise<string | null>;
  portalUsers: PortalUser[];
  createMeeting: (input: MeetingInput) => Promise<MutationResult>;
  updateMeeting: (id: string, input: Partial<MeetingInput>) => Promise<MutationResult>;
  setMeetingStatus: (id: string, status: Meeting["status"]) => Promise<MutationResult>;
  respondToMeeting: (id: string, response: "accepted" | "declined") => Promise<MutationResult>;
  meetingsLoading: boolean;
  refreshMeetings: () => Promise<void>;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [directory, setDirectory] = useState<ChatContact[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLogRow[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [clickup, setClickup] = useState({
    connected: true,
    workspace: "ClickUp · Delivery list",
    lastSync: null as string | null,
    autoSync: true,
  });

  // Chat is backed by the database (realtime); meetings stay local for now.
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [rawMessages, setRawMessages] = useState<ChatMessage[]>([]);
  const [reads, setReads] = useState<Record<string, string>>({});
  // Every participant's last-read marker, keyed channelId → userId → ISO time (read receipts).
  const [peerReads, setPeerReads] = useState<Record<string, Record<string, string>>>({});
  const [reactionRows, setReactionRows] = useState<{ message_id: string; user_id: string; emoji: string }[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  const taskRefreshRef = useRef(0);

  const notify = useCallback((title: string, body: string, portal: AppNotification["portal"]) => {
    setNotifications((n) =>
      [{ id: uid("NTF"), title, body, at: new Date().toISOString(), read: false, portal }, ...n].slice(0, 40),
    );
  }, []);

  const loadProfile = useCallback(async (authUserId: string, email: string) => {
    const { data: profile } = await supabase
      .from("users")
      .select("id, name, email, phone, role, role_title")
      .eq("id", authUserId)
      .maybeSingle();
    if (!profile) return null;
    const { data: client } = await supabase
      .from("clients")
      .select("id, company_name")
      .eq("user_id", authUserId)
      .maybeSingle();
    const { data: member } = await supabase
      .from("team_members")
      .select("id, role_title")
      .eq("user_id", authUserId)
      .maybeSingle();
    const next: AppUser = {
      id: profile.id,
      name: profile.name || email.split("@")[0]!,
      email: profile.email || email,
      portal: profile.role as Portal,
      avatarColor: COLORS[Math.abs(profile.id.charCodeAt(0)) % COLORS.length]!,
      ...(client?.company_name ? { company: client.company_name } : {}),
      ...(profile.phone ? { phone: profile.phone } : {}),
      ...(profile.role_title || member?.role_title ? { roleTitle: profile.role_title ?? member?.role_title ?? "" } : {}),
      clientId: client?.id ?? null,
      teamMemberId: member?.id ?? null,
    };
    return next;
  }, []);

  const refreshTasks = useCallback(async () => {
    const request = ++taskRefreshRef.current;
    try {
      const next = await fetchTasks();
      if (request === taskRefreshRef.current) setTasks(next);
    } catch {
      /* RLS or offline — keep the latest visible task state */
    }
  }, []);

  const refreshData = useCallback(async () => {
    void refreshTasks();
    const [activityResult, membersResult, syncResult, clientsResult] = await Promise.allSettled([
      fetchActivity(),
      fetchTeamMembers(),
      fetchSyncLogs(),
      fetchClients(),
    ]);
    if (activityResult.status === "fulfilled") setActivity(activityResult.value);
    if (membersResult.status === "fulfilled") {
      setMembers(membersResult.value.length ? membersResult.value : seedMembers);
    }
    setSyncLogs(syncResult.status === "fulfilled" ? syncResult.value : []);
    if (clientsResult.status === "fulfilled") setClients(clientsResult.value);
  }, [refreshTasks]);

  // Session bootstrap + auth listener
  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session?.user) {
        setUser(null);
        setTasks([]);
        setActivity([]);
        return;
      }
      void loadProfile(session.user.id, session.user.email ?? "").then((p) => {
        if (active) setUser(p);
      });
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const p = await loadProfile(data.session.user.id, data.session.user.email ?? "");
        if (active) setUser(p);
      }
      if (active) setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Load data whenever we have a signed-in profile
  useEffect(() => {
    if (!user) return;
    void refreshData();
  }, [user, refreshData]);

  // Realtime: tasks + task_activity keep every portal in sync live
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("flowdesk-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        void refreshTasks();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_activity" }, () => {
        void fetchActivity().then(setActivity).catch(() => undefined);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refreshTasks]);

  /* ------------------------------------------------------------------ */
  /* Meetings (live)                                                      */
  /* ------------------------------------------------------------------ */

  const refreshMeetings = useCallback(async () => {
    try {
      setMeetings(await fetchMeetings());
    } catch {
      /* RLS or offline — keep the last known meetings */
    } finally {
      setMeetingsLoading(false);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const rows = await fetchNotifications();
      setNotifications(
        rows.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          at: n.createdAt,
          read: Boolean(n.readAt),
          portal: "system" as const,
        })),
      );
    } catch {
      /* keep whatever we have */
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setMeetings([]);
      setNotifications([]);
      setPortalUsers([]);
      setMeetingsLoading(false);
      return;
    }
    setMeetingsLoading(true);
    void refreshMeetings();
    void refreshNotifications();
    fetchPortalUsers()
      .then(setPortalUsers)
      .catch(() => setPortalUsers([]));
    const channel = supabase
      .channel("magsmen-meetings")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => {
        void refreshMeetings();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_participants" }, () => {
        void refreshMeetings();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          void refreshNotifications();
        },
      )
      .subscribe();
    // Re-derive live/completed status from the clock every minute.
    const tick = window.setInterval(() => setMeetings((prev) => [...prev]), 60000);
    return () => {
      window.clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [user, refreshMeetings, refreshNotifications]);

  /* ------------------------------------------------------------------ */
  /* Chat: channels + messages + read markers (live)                      */
  /* ------------------------------------------------------------------ */

  const refreshChat = useCallback(async () => {
    if (!user) return;
    const [ch, ms, rd, pt, rx] = await Promise.allSettled([
      supabase.from("chat_channels").select("*").order("created_at", { ascending: true }),
      supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(500),
      supabase.from("chat_reads").select("channel_id, user_id, last_read_at"),
      supabase.from("chat_participants").select("channel_id, user_id"),
      supabase.from("chat_reactions").select("message_id, user_id, emoji"),
    ]);
    const byChannel: Record<string, string[]> = {};
    if (pt.status === "fulfilled" && pt.value.data) {
      for (const p of pt.value.data) (byChannel[p.channel_id] ??= []).push(p.user_id);
    }
    if (ch.status === "fulfilled" && ch.value.data) {
      setChannels(
        ch.value.data.map((row) => {
          const kind = (row.kind === "direct" ? "direct" : "group") as ChatChannel["kind"];
          const roomType = ((row.room_type === "client" || row.room_type === "task" || row.room_type === "dm"
            ? row.room_type
            : kind === "direct"
              ? "dm"
              : "task") as ChatChannel["roomType"]);
          return {
            id: row.id,
            name: row.name,
            kind,
            roomType,
            clientId: row.client_id ?? null,
            description: row.description ?? null,
            archivedAt: row.archived_at ?? null,
            members: byChannel[row.id] ?? ((row.member_ids ?? []) as string[]),
            portals: (row.portals ?? []) as Portal[],
            ...(row.task_id ? { taskId: row.task_id } : {}),
          };
        }),
      );
    }
    if (ms.status === "fulfilled" && ms.value.data) {
      setRawMessages(
        ms.value.data.map((m) => ({
          id: m.id,
          channelId: m.channel_id,
          authorId: m.author_id ?? "",
          authorName: m.author_name,
          body: m.body,
          at: m.created_at,
          read: true,
          kind: (m.kind ?? "text") as ChatMessageKind,
          attachmentUrl: m.attachment_url ?? null,
          attachmentName: m.attachment_name ?? null,
          attachmentMime: m.attachment_mime ?? null,
          attachmentSize: m.attachment_size ?? null,
          deletedAt: m.deleted_at ?? null,
          editedAt: m.edited_at ?? null,
          reactions: [],
          receipt: "sent" as const,
        })),
      );
    }
    const mine: Record<string, string> = readLocalChatReads(user.id);
    const all: Record<string, Record<string, string>> = {};
    if (rd.status === "fulfilled" && rd.value.data) {
      for (const r of rd.value.data) {
        (all[r.channel_id] ??= {})[r.user_id] = r.last_read_at;
        if (r.user_id === user.id) mine[r.channel_id] = latestIso(mine[r.channel_id], r.last_read_at) ?? r.last_read_at;
      }
    }
    setReads(mine);
    setPeerReads(all);
    if (rx.status === "fulfilled" && rx.value.data) setReactionRows(rx.value.data);
    void fetchChatDirectory()
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setChannels([]);
      setRawMessages([]);
      setDirectory([]);
      setReads({});
      setPeerReads({});
      setReactionRows([]);
      return;
    }
    void refreshChat();

    const channel = supabase
      .channel("magsmen-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => {
        void refreshChat();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_channels" }, () => {
        void refreshChat();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_participants" }, () => {
        void refreshChat();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => {
        void refreshChat();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, () => {
        void refreshChat();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refreshChat]);

  const messages = useMemo<ChatMessage[]>(() => {
    const byMessage: Record<string, Record<string, string[]>> = {};
    for (const r of reactionRows) ((byMessage[r.message_id] ??= {})[r.emoji] ??= []).push(r.user_id);
    const memberIdsOf: Record<string, string[]> = {};
    for (const c of channels) memberIdsOf[c.id] = c.members;

    return rawMessages.map((m) => {
      const lastRead = reads[m.channelId];
      const read = m.authorId === user?.id || (!!lastRead && +new Date(m.at) <= +new Date(lastRead));
      const reactions: ChatReaction[] = Object.entries(byMessage[m.id] ?? {}).map(([emoji, userIds]) => ({
        emoji,
        userIds,
      }));

      // Receipts: "read" when every other participant read past this message,
      // "delivered" when at least one of them has ever opened the room.
      let receipt: ChatMessage["receipt"] = "sent";
      if (m.authorId === user?.id) {
        const others = (memberIdsOf[m.channelId] ?? []).filter((id) => id !== user?.id);
        const marks = peerReads[m.channelId] ?? {};
        const seenBy = others.filter((id) => marks[id] && +new Date(marks[id]!) >= +new Date(m.at));
        if (others.length > 0 && seenBy.length === others.length) receipt = "read";
        else if (others.some((id) => marks[id])) receipt = "delivered";
      }
      return { ...m, read, reactions, receipt };
    });
  }, [rawMessages, reads, peerReads, reactionRows, channels, user]);

  const signIn = useCallback<Ctx["signIn"]>(async (email, password, portal) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) return { ok: false, message: error?.message ?? "Invalid email or password." };
    const profile = await loadProfile(data.user.id, data.user.email ?? "");
    if (!profile) {
      await supabase.auth.signOut();
      return { ok: false, message: "No profile found for this account." };
    }
    if (profile.portal !== portal) {
      await supabase.auth.signOut();
      setUser(null);
      return { ok: false, message: `This account belongs to the ${profile.portal} portal.` };
    }
    setUser(profile);
    return { ok: true, message: `Welcome back, ${profile.name.split(" ")[0]}` };
  }, [loadProfile]);

  const signUp = useCallback<Ctx["signUp"]>(async (input, portal) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          name: input.name.trim(),
          role: portal,
          phone: input.phone ?? null,
          company_name: input.company ?? "",
        },
      },
    });
    if (error) return { ok: false, message: error.message };
    if (!data.session) {
      return { ok: true, message: "Account created. Check your email to confirm your address." };
    }
    const profile = await loadProfile(data.user!.id, data.user!.email ?? "");
    setUser(profile);
    return { ok: true, message: "Account created" };
  }, [loadProfile]);

  const resetPassword = useCallback<Ctx["resetPassword"]>(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Password reset link sent. Check your inbox." };
  }, []);

  const updateProfile = useCallback<Ctx["updateProfile"]>(
    async ({ name, phone }) => {
      if (!user) return { ok: false, message: "Not signed in." };
      const { error } = await supabase.from("users").update({ name, phone }).eq("id", user.id);
      if (error) return { ok: false, message: error.message };
      setUser({ ...user, name, phone });
      return { ok: true, message: "Profile updated." };
    },
    [user],
  );

  const updatePassword = useCallback<Ctx["updatePassword"]>(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Password updated." };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setTasks([]);
    setActivity([]);
  }, []);

  const pushToClickup = useCallback(async (taskId: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      await fetch("/api/public/clickup/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ taskId }),
      });
    } catch {
      /* sync happens in the background — never block the UI */
    }
  }, []);

  const notifyByEmail = useCallback(async (taskId: string, kind: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      await fetch("/api/public/task-notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify({ taskId, kind }),
      });
    } catch {
      /* email delivery is best-effort; the Activity tab is the backup */
    }
  }, []);


  const createTask = useCallback<Ctx["createTask"]>(
    async (input) => {
      if (!user) return;
      const member = members.find((m) => m.name === input.assignee);
      const clientId =
        user.portal === "client"
          ? user.clientId ?? null
          : (await supabase.from("clients").select("id").eq("company_name", input.clientName).maybeSingle()).data
              ?.id ?? null;
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          due_date: input.dueDate || null,
          tags: input.tags,
          client_id: clientId,
          assigned_to: member?.id ?? null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error || !data) {
        notify("Task not saved", error?.message ?? "Unknown error", user.portal);
        return;
      }
      await logActivity({
        taskId: data.id,
        status: input.status,
        note: `raised the task${member ? ` and assigned it to ${member.name}` : ""}`,
        actorName: user.name,
        actorId: user.id,
      });
      notify("Task created", `${input.title} was added to the board.`, user.portal);
      void notifyByEmail(data.id, member ? "assigned" : "created");
      void pushToClickup(data.id);
      void refreshData();
    },
    [user, members, notify, notifyByEmail, pushToClickup, refreshData],
  );

  const updateTask = useCallback<Ctx["updateTask"]>(
    async (id, input) => {
      if (!user) return false;
      const before = tasks.find((t) => t.id === id);
      const member = input.assignee ? members.find((m) => m.name === input.assignee) : undefined;
      const patch: TablesUpdate<"tasks"> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.status !== undefined) patch.status = input.status;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.dueDate !== undefined) patch.due_date = input.dueDate || null;
      if (input.tags !== undefined) patch.tags = input.tags;
      if (member) patch.assigned_to = member.id;
      if (before) {
        setTasks((current) =>
          current.map((task) =>
            task.id === id
              ? {
                  ...task,
                  ...(input.title !== undefined ? { title: input.title } : {}),
                  ...(input.description !== undefined ? { description: input.description } : {}),
                  ...(input.status !== undefined ? { status: input.status } : {}),
                  ...(input.priority !== undefined ? { priority: input.priority } : {}),
                  ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
                  ...(input.tags !== undefined ? { tags: input.tags } : {}),
                  ...(member ? { assignedTo: member.id, assignee: member.name } : {}),
                  updatedAt: new Date().toISOString(),
                }
              : task,
          ),
        );
      }
      const { data: updatedRow, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error || !updatedRow) {
        if (before) setTasks((current) => current.map((task) => (task.id === id ? before : task)));
        notify("Update blocked", error?.message ?? "This task is not available to update.", user.portal);
        return false;
      }
      const statusChanged = input.status && input.status !== before?.status;
      await logActivity({
        taskId: id,
        status: input.status ?? before?.status ?? null,
        note: statusChanged ? `changed status to ${input.status}` : "updated the task",
        actorName: user.name,
        actorId: user.id,
      });
      if (statusChanged) void notifyByEmail(id, "status");
      else if (member && member.id !== before?.assignedTo) void notifyByEmail(id, "assigned");
      void pushToClickup(id);
      const fresh = await fetchTaskById(id).catch(() => null);
      if (fresh) setTasks((current) => current.map((task) => (task.id === id ? fresh : task)));
      else void refreshTasks();
      return true;
    },
    [user, tasks, members, notify, notifyByEmail, pushToClickup, refreshTasks],
  );

  const deleteTask = useCallback<Ctx["deleteTask"]>(
    async (id) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) {
        notify("Delete blocked", error.message, user?.portal ?? "system");
        return;
      }
      void refreshData();
    },
    [notify, refreshData, user],
  );

  const markAllRead = useCallback(() => {
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    void markNotificationsRead().catch(() => undefined);
  }, []);

  const toggleClickup = useCallback(() => setClickup((c) => ({ ...c, connected: !c.connected })), []);
  const toggleAutoSync = useCallback(() => setClickup((c) => ({ ...c, autoSync: !c.autoSync })), []);

  const syncClickup = useCallback<Ctx["syncClickup"]>(async () => {
    let pushed = 0;
    for (const t of tasks) {
      await pushToClickup(t.id);
      pushed += 1;
    }
    setClickup((c) => ({ ...c, lastSync: new Date().toISOString() }));
    try {
      setSyncLogs(await fetchSyncLogs());
    } catch {
      /* noop */
    }
    void refreshData();
    return pushed;
  }, [tasks, pushToClickup, refreshData]);

  const retrySync = useCallback<Ctx["retrySync"]>(
    async (taskId) => {
      await pushToClickup(taskId);
      try {
        setSyncLogs(await fetchSyncLogs());
      } catch {
        /* noop */
      }
      const fresh = await fetchTaskById(taskId);
      if (fresh) setTasks((prev) => prev.map((t) => (t.id === taskId ? fresh : t)));
    },
    [pushToClickup],
  );

  /* ------------------------------------------------------------------ */
  /* Messages — realtime, participant-scoped                              */
  /* ------------------------------------------------------------------ */

  const sendMessage = useCallback<Ctx["sendMessage"]>(
    async (channelId, body, attachment) => {
      const text = body.trim();
      if (!user || !channelId || (!text && !attachment)) return;
      const optimistic: ChatMessage = {
        id: uid("msg"),
        channelId,
        authorId: user.id,
        authorName: user.name,
        body: text,
        at: new Date().toISOString(),
        read: true,
        kind: attachment?.kind ?? "text",
        attachmentUrl: attachment?.url ?? null,
        attachmentName: attachment?.name ?? null,
        attachmentMime: attachment?.mime ?? null,
        attachmentSize: attachment?.size ?? null,
        reactions: [],
        receipt: "sent",
      };
      setRawMessages((prev) => [...prev, optimistic]);
      const { error } = await supabase.from("chat_messages").insert({
        channel_id: channelId,
        author_id: user.id,
        author_name: user.name,
        body: text,
        kind: attachment?.kind ?? "text",
        attachment_url: attachment?.url ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_mime: attachment?.mime ?? null,
        attachment_size: attachment?.size ?? null,
      });
      if (error) {
        setRawMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        notify("Message not sent", error.message, user.portal);
        return;
      }
      void refreshChat();
    },
    [user, notify, refreshChat],
  );

  const uploadChatFile = useCallback<Ctx["uploadChatFile"]>(
    async (file) => {
      if (!user) return null;
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("chat-media").upload(path, file, { upsert: false });
      if (error) {
        notify("Upload failed", error.message, user.portal);
        return null;
      }
      return { path, name: file.name, mime: file.type || "application/octet-stream", size: file.size };
    },
    [user, notify],
  );

  const toggleReaction = useCallback<Ctx["toggleReaction"]>(
    async (messageId, channelId, emoji) => {
      if (!user) return;
      const existing = reactionRows.find(
        (r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji,
      );
      if (existing) {
        setReactionRows((prev) =>
          prev.filter((r) => !(r.message_id === messageId && r.user_id === user.id && r.emoji === emoji)),
        );
        await supabase
          .from("chat_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
      } else {
        setReactionRows((prev) => [...prev, { message_id: messageId, user_id: user.id, emoji }]);
        const { error } = await supabase
          .from("chat_reactions")
          .insert({ message_id: messageId, channel_id: channelId, user_id: user.id, emoji });
        if (error) notify("Reaction failed", error.message, user.portal);
      }
      void refreshChat();
    },
    [user, reactionRows, notify, refreshChat],
  );

  const deleteMessage = useCallback<Ctx["deleteMessage"]>(
    async (messageId) => {
      if (!user) return;
      const at = new Date().toISOString();
      setRawMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedAt: at } : m)));
      const { error } = await supabase
        .from("chat_messages")
        .update({ deleted_at: at, body: "" })
        .eq("id", messageId)
        .eq("author_id", user.id);
      if (error) notify("Message not deleted", error.message, user.portal);
      void refreshChat();
    },
    [user, notify, refreshChat],
  );

  const renameChannel = useCallback<Ctx["renameChannel"]>(
    async (channelId, name) => {
      const label = name.trim();
      if (!user || !label) return;
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, name: label } : c)));
      const { error } = await supabase.from("chat_channels").update({ name: label }).eq("id", channelId);
      if (error) notify("Rename failed", error.message, user.portal);
      void refreshChat();
    },
    [user, notify, refreshChat],
  );

  const archiveChannel = useCallback<Ctx["archiveChannel"]>(
    async (channelId, archived) => {
      if (!user) return;
      const at = archived ? new Date().toISOString() : null;
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, archivedAt: at } : c)));
      const { error } = await supabase.from("chat_channels").update({ archived_at: at }).eq("id", channelId);
      if (error) notify("Could not update conversation", error.message, user.portal);
      void refreshChat();
    },
    [user, notify, refreshChat],
  );

  const markChannelRead = useCallback<Ctx["markChannelRead"]>(
    (channelId) => {
      if (!user || !channelId) return;
      const at = new Date().toISOString();
      writeLocalChatRead(user.id, channelId, at);
      setReads((prev) => ({ ...prev, [channelId]: at }));
      setPeerReads((prev) => ({ ...prev, [channelId]: { ...(prev[channelId] ?? {}), [user.id]: at } }));
      // Persisted so the room stays read after a refresh (not just for this session).
      void supabase
        .from("chat_reads")
        .upsert({ user_id: user.id, channel_id: channelId, last_read_at: at }, { onConflict: "user_id,channel_id" })
        .then(({ error }) => {
          if (error) notify("Read status not saved", error.message, user.portal);
        });
    },
    [user, notify],
  );

  const openDirectChannel = useCallback<Ctx["openDirectChannel"]>(
    async (member) => {
      if (!user) return null;
      // A direct conversation always targets one specific signed-in person.
      const peerUserId = member.userId;
      if (!peerUserId || peerUserId === user.id) {
        notify("Cannot start chat", `${member.name} has not activated their portal account yet.`, user.portal);
        return null;
      }
      const existing = channels.find(
        (c) =>
          c.kind === "direct" &&
          c.members.length === 2 &&
          c.members.includes(user.id) &&
          c.members.includes(peerUserId),
      );
      if (existing) return existing.id;
      const { data, error } = await supabase
        .from("chat_channels")
        .insert({
          name: member.name,
          kind: "direct",
          room_type: "dm",
          member_ids: [user.id, peerUserId],
          created_by: user.id,
          portals: ["client", "team", "admin"],
        })
        .select("id")
        .single();
      if (error || !data) {
        notify("Chat not started", error?.message ?? "Try again", user.portal);
        return null;
      }
      const { error: pErr } = await supabase
        .from("chat_participants")
        .insert([
          { channel_id: data.id, user_id: user.id },
          { channel_id: data.id, user_id: peerUserId },
        ]);
      if (pErr) notify("Chat not shared", pErr.message, user.portal);
      await refreshChat();
      return data.id;
    },
    [user, channels, notify, refreshChat],
  );

  const createChannel = useCallback<Ctx["createChannel"]>(
    async (name, memberIds, options) => {
      const label = name.trim();
      if (!user || !label) return null;
      const ids = Array.from(new Set([user.id, ...memberIds])).filter(Boolean);
      const { data, error } = await supabase
        .from("chat_channels")
        .insert({
          name: label,
          kind: "group",
          member_ids: ids,
          created_by: user.id,
          portals: ["client", "team", "admin"],
          room_type: options?.roomType ?? "task",
          ...(options?.clientId ? { client_id: options.clientId } : {}),
          ...(options?.description ? { description: options.description } : {}),
        })
        .select("id")
        .single();
      if (error || !data) {
        notify("Room not created", error?.message ?? "Try again", user.portal);
        return null;
      }
      const { error: pErr } = await supabase
        .from("chat_participants")
        .insert(ids.map((id) => ({ channel_id: data.id, user_id: id })));
      if (pErr) notify("Members not added", pErr.message, user.portal);
      await refreshChat();
      return data.id;
    },
    [user, notify, refreshChat],
  );



  const errText = (e: unknown) =>
    e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong.";

  const createMeeting = useCallback<Ctx["createMeeting"]>(
    async (input) => {
      if (!user) return { ok: false, message: "Please sign in again." };
      try {
        await createMeetingFn({
          data: {
            title: input.title,
            agenda: input.agenda ?? "",
            startsAt: new Date(input.startsAt).toISOString(),
            durationMins: input.durationMins,
            participantIds: input.participantIds,
            project: input.project ?? "",
            clientId: input.clientId ?? null,
          },
        });
        await refreshMeetings();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: errText(e) };
      }
    },
    [user, refreshMeetings],
  );

  const updateMeeting = useCallback<Ctx["updateMeeting"]>(
    async (id, input) => {
      try {
        await updateMeetingFn({
          data: {
            id,
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.agenda !== undefined ? { agenda: input.agenda } : {}),
            ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt).toISOString() } : {}),
            ...(input.durationMins !== undefined ? { durationMins: input.durationMins } : {}),
            ...(input.project !== undefined ? { project: input.project } : {}),
            ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
            ...(input.participantIds !== undefined ? { participantIds: input.participantIds } : {}),
          },
        });
        await refreshMeetings();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: errText(e) };
      }
    },
    [refreshMeetings],
  );

  const setMeetingStatus = useCallback<Ctx["setMeetingStatus"]>(
    async (id, status) => {
      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
      try {
        await setMeetingStatusFn({ data: { id, status } });
        await refreshMeetings();
        return { ok: true };
      } catch (e) {
        await refreshMeetings();
        return { ok: false, message: errText(e) };
      }
    },
    [refreshMeetings],
  );

  const respondToMeeting = useCallback<Ctx["respondToMeeting"]>(
    async (id, response) => {
      try {
        await respondToMeetingFn({ data: { id, response } });
        await refreshMeetings();
        return { ok: true };
      } catch (e) {
        return { ok: false, message: errText(e) };
      }
    },
    [refreshMeetings],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      user,
      tasks,
      activity,
      notifications,
      members,
      clients,
      directory,
      syncLogs,
      clickup,
      signIn,
      signUp,
      resetPassword,
      updateProfile,
      updatePassword,
      signOut,
      createTask,
      updateTask,
      deleteTask,
      markAllRead,
      toggleClickup,
      toggleAutoSync,
      syncClickup,
      retrySync,
      channels,
      messages,
      meetings,
      sendMessage,
      uploadChatFile,
      toggleReaction,
      deleteMessage,
      renameChannel,
      archiveChannel,
      markChannelRead,
      openDirectChannel,
      createChannel,
      portalUsers,
      meetingsLoading,
      refreshMeetings,
      createMeeting,
      updateMeeting,
      setMeetingStatus,
      respondToMeeting,
    }),
    [
      ready,
      user,
      tasks,
      activity,
      notifications,
      members,
      clients,
      directory,
      syncLogs,
      clickup,
      signIn,
      signUp,
      resetPassword,
      updateProfile,
      updatePassword,
      signOut,
      createTask,
      updateTask,
      deleteTask,
      markAllRead,
      toggleClickup,
      toggleAutoSync,
      syncClickup,
      retrySync,
      channels,
      messages,
      meetings,
      sendMessage,
      uploadChatFile,
      toggleReaction,
      deleteMessage,
      renameChannel,
      archiveChannel,
      markChannelRead,
      openDirectChannel,
      createChannel,
      portalUsers,
      meetingsLoading,
      refreshMeetings,
      createMeeting,
      updateMeeting,
      setMeetingStatus,
      respondToMeeting,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
