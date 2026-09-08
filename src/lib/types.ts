export type Portal = "client" | "team" | "admin";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "completed" | "rejected";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  portal: Portal;
  company?: string;
  phone?: string;
  roleTitle?: string;
  clientId?: string | null;
  teamMemberId?: string | null;
  avatarColor: string;
}

export interface Task {
  id: string;
  taskRef: string;
  clientId: string | null;
  assignedTo: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  clientName: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  clickupId: string | null;
  syncedAt: string | null;
}

export interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
  portal: Portal | "system";
  status?: TaskStatus | null;
  taskId?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  portal: Portal | "system";
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  completed: "Completed",
  rejected: "Rejected",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "in_review", "rejected", "completed"];
export const PRIORITY_ORDER: TaskPriority[] = ["low", "normal", "high", "urgent"];

export interface TeamMember {
  userId?: string;
  id: string;
  name: string;
  role: string;
  email: string;
  phone?: string;
  isSuperAdmin?: boolean;
  portal: Portal;
  status: "online" | "away" | "offline";
  color: string;
}

/** Kinds of bubble a message can render as. */
export type ChatMessageKind = "text" | "image" | "document" | "audio" | "contact" | "poll" | "event" | "sticker";

export interface ChatReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  body: string;
  at: string;
  read: boolean;
  kind: ChatMessageKind;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  deletedAt?: string | null;
  editedAt?: string | null;
  reactions: ChatReaction[];
  /** Read receipt state for messages you sent: sent → delivered → read. */
  receipt: "sent" | "delivered" | "read";
}

/** Where a conversation belongs in the sidebar: a client home room, a task room, or a 1:1 DM. */
export type RoomType = "client" | "task" | "dm";

export interface ChatChannel {
  id: string;
  name: string;
  kind: "group" | "direct";
  roomType: RoomType;
  clientId?: string | null;
  description?: string | null;
  members: string[];
  taskId?: string;
  portals: Portal[];
  archivedAt?: string | null;
}

export interface MeetingParticipant {
  userId: string;
  role: string;
  responseStatus: string;
}

export interface Meeting {
  id: string;
  title: string;
  agenda: string;
  startsAt: string;
  durationMins: number;
  host: string;
  hostId?: string | null;
  attendees: string[];
  link: string;
  status: "scheduled" | "live" | "completed" | "cancelled";
  portals: Portal[];
  clientId?: string | null;
  clientName?: string;
  project?: string;
  zoomJoinUrl?: string | null;
  zoomStartUrl?: string | null;
  zoomMeetingId?: string | null;
  cancelledAt?: string | null;
  createdBy?: string | null;
  participants?: MeetingParticipant[];
}

/** Status derived from the clock (cancelled/completed stay sticky). */
export function effectiveMeetingStatus(m: Meeting): Meeting["status"] {
  if (m.status === "cancelled") return "cancelled";
  const start = +new Date(m.startsAt);
  const end = start + m.durationMins * 60000;
  const now = Date.now();
  if (now >= end) return "completed";
  if (now >= start) return "live";
  return m.status === "completed" ? "completed" : "scheduled";
}

export interface SyncLogRow {
  id: string;
  taskId: string | null;
  taskTitle: string;
  clickupTaskId: string | null;
  syncStatus: "synced" | "pending" | "failed";
  direction: string;
  lastSyncedAt: string | null;
  errorMessage: string | null;
}
