import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Contact as ContactIcon,
  CornerUpLeft,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Folder,
  Forward,
  Image as ImageIcon,
  Lock,
  MessageSquarePlus,
  Mic,
  MonitorUp,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  Pin,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Smile,
  SquarePen,
  Star,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageAttachment } from "@/components/chat-media";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import { cn } from "@/lib/utils";
import type { ChatContact } from "@/lib/api";
import type { ChatMessage, ChatMessageKind, Portal } from "@/lib/types";
import { useCalls } from "@/components/call-center";
import type { CallType } from "@/hooks/use-call-signaling";

export const Route = createFileRoute("/portal/$portal/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Magsmen Portal" },
      { name: "description", content: "Private realtime conversations with your Magsmen team." },
      { property: "og:title", content: "Messages — Magsmen Portal" },
      { property: "og:description", content: "One-to-one and project rooms with unread tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MessagesPage,
});

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function relative(iso: string) {
  const mins = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return dayLabel(iso);
}

const roleLabel: Record<ChatContact["role"], string> = { admin: "Admin", team: "Team", client: "Client" };
const WHATSAPP_QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EXPANDED_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😆",
  "😅",
  "😂",
  "🤣",
  "😊",
  "😇",
  "🙂",
  "🙃",
  "😉",
  "😌",
  "😍",
  "🥰",
  "😘",
  "😗",
  "😙",
  "😚",
  "😋",
  "😛",
  "😝",
  "😜",
  "🤪",
  "🤨",
  "🧐",
  "🤓",
  "😎",
  "🤩",
  "🥳",
  "😏",
  "😒",
  "😞",
  "😔",
  "😟",
  "😕",
  "🙁",
  "☹️",
  "😣",
  "😖",
  "😫",
  "😩",
  "🥺",
  "😢",
  "😭",
  "😤",
  "😠",
  "😡",
  "🤬",
  "🤯",
  "😳",
  "🥵",
  "🥶",
  "😱",
  "😨",
  "😰",
  "😥",
  "😓",
  "🤗",
  "🤔",
  "🤭",
  "🤫",
  "🤥",
  "😶",
  "😐",
  "😑",
  "😬",
  "🙄",
  "😯",
  "😦",
  "😧",
  "😮",
  "😲",
  "🥱",
  "😴",
  "🤤",
  "😪",
  "😵",
  "🤐",
  "👍",
  "👎",
  "👊",
  "✊",
  "🤛",
  "🤜",
  "🤞",
  "✌️",
  "🤟",
  "🤘",
  "👌",
  "🤌",
  "🤏",
  "👈",
  "👉",
  "👆",
  "👇",
  "☝️",
  "✋",
  "🤚",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "🤍",
  "🤎",
  "💔",
  "🔥",
  "✨",
  "🌟",
  "💫",
  "💥",
  "🎉",
  "🎊",
  "🚀",
  "💯",
  "✅",
];

function preview(m?: ChatMessage) {
  if (!m) return undefined;
  if (m.deletedAt) return "This message was deleted";
  if (m.kind === "image") return "📷 Photo";
  if (m.kind === "audio") return "🎤 Audio";
  if (m.kind === "document") return `📄 ${m.attachmentName ?? "Document"}`;
  if (m.kind === "contact") return "👤 Contact";
  return `${m.body.slice(0, 42)}${m.body.length > 42 ? "…" : ""}`;
}

const AVATAR_BG_COLORS = [
  "bg-[#0284c7] text-white",
  "bg-[#2563eb] text-white",
  "bg-[#7c3aed] text-white",
  "bg-[#ea580c] text-white",
  "bg-[#e11d48] text-white",
  "bg-[#10b981] text-white",
  "bg-[#059669] text-white",
];

function getAvatarBg(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_BG_COLORS[Math.abs(hash) % AVATAR_BG_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  const first = parts[0];
  if (!first) return "";
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

export function MessagesPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "client") as Portal;
  const {
    channels,
    messages,
    directory,
    tasks,
    user,
    sendMessage,
    uploadChatFile,
    toggleReaction,
    deleteMessage,
    renameChannel,
    archiveChannel,
    markChannelRead,
    openDirectChannel,
    createChannel,
  } = useApp();

  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [mode, setMode] = useState<"direct" | "room" | "client">("direct");
  const [openSections, setOpenSections] = useState({ client: true, task: true, dm: true, archived: false });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const [roomName, setRoomName] = useState("");
  const [roomMembers, setRoomMembers] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [callHint, setCallHint] = useState<string | null>(null);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [fullPickerFor, setFullPickerFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [starredMessages, setStarredMessages] = useState<string[]>([]);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);


  const [online, setOnline] = useState<string[]>([]);
  const [typingBy, setTypingBy] = useState<Record<string, { name: string; at: number }>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<ChatMessageKind>("document");
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const visible = channels.filter((c) => !c.archivedAt);
  const archived = channels.filter((c) => c.archivedAt);

  const unreadFor = (id: string) =>
    messages.filter((m) => m.channelId === id && m.authorId !== user?.id && !m.read).length;

  const lastOf = (id: string) => {
    const list = messages.filter((m) => m.channelId === id);
    return list[list.length - 1];
  };

  const peerOf = (members: string[]) => {
    const peerId = members.find((m) => m !== user?.id);
    return directory.find((d) => d.userId === peerId);
  };

  const titleOf = (c: (typeof channels)[number]) =>
    c.kind === "direct" ? (peerOf(c.members)?.name ?? c.name) : c.name;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible
      .filter((c) => (q ? titleOf(c).toLowerCase().includes(q) : true))
      .filter((c) => (unreadOnly ? unreadFor(c.id) > 0 : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, query, unreadOnly, messages, directory, user]);

  useEffect(() => {
    const firstChannel = filtered[0];
    if (!activeId && firstChannel) setActiveId(firstChannel.id);
  }, [filtered, activeId]);

  const active =
    filtered.find((c) => c.id === activeId) ?? channels.find((c) => c.id === activeId) ?? filtered[0] ?? visible[0];

  const isGroupConversation = active ? active.kind === "group" : false;

  const thread = useMemo(
    () => [...messages.filter((m) => m.channelId === active?.id)].sort((a, b) => +new Date(a.at) - +new Date(b.at)),
    [messages, active],
  );

  /* Seen/Unseen Read Marking: only runs for incoming messages */
  useEffect(() => {
    if (!active || !user) return;

    const unreadIncoming = thread.filter((m) => m.authorId !== user.id && !m.read);

    if (unreadIncoming.length > 0) {
      markChannelRead(active.id);
    }
  }, [active, thread, user, markChannelRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, active?.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".message-dropdown-container") && !target.closest(".message-reaction-container")) {
        setMenuFor(null);
        setReactFor(null);
        setFullPickerFor(null);
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  /* Realtime presence & typing */
  useEffect(() => {
    if (!user || !active?.id) return;
    setTypingBy({});
    const ch = supabase.channel(`chat-presence-${active.id}`, { config: { presence: { key: user.id } } });
    presenceRef.current = ch;
    ch.on("presence", { event: "sync" }, () => setOnline(Object.keys(ch.presenceState())))
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { userId: string; name: string };
        if (p.userId === user.id) return;
        setTypingBy((prev) => ({ ...prev, [p.userId]: { name: p.name, at: Date.now() } }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track({ userId: user.id, name: user.name });
      });
    const timer = window.setInterval(() => {
      setTypingBy((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => Date.now() - v.at < 4000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1500);
    return () => {
      window.clearInterval(timer);
      presenceRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [user, active?.id]);

  const lastTypingSent = useRef(0);
  const broadcastTyping = () => {
    if (!user || !presenceRef.current) return;
    if (Date.now() - lastTypingSent.current < 1500) return;
    lastTypingSent.current = Date.now();
    void presenceRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id, name: user.name.split(" ")[0] },
    });
  };

  const linkedTask = useMemo(() => tasks.find((t) => t.id === active?.taskId), [tasks, active]);

  const clientRooms = filtered.filter((c) => c.kind === "group" && c.roomType === "client");
  const rooms = filtered.filter((c) => c.kind === "group" && c.roomType !== "client");
  const directs = useMemo(() => {
    const seen = new Set<string>();
    return filtered
      .filter((c) => c.kind === "direct")
      .filter((c) => {
        const key = [...c.members].sort().join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [filtered]);

  const canCreateRooms = portal !== "client";

  const openDm = async (contact: ChatContact) => {
    const id = await openDirectChannel({ name: contact.name, userId: contact.userId });
    if (id) {
      setActiveId(id);
      setNewOpen(false);
      setMobileView("chat");
    }
  };

  const pickFile = (kind: ChatMessageKind, accept: string, capture?: boolean) => {
    pendingKind.current = kind;
    if (!fileRef.current) return;
    fileRef.current.accept = accept;
    if (capture) fileRef.current.setAttribute("capture", "environment");
    else fileRef.current.removeAttribute("capture");
    fileRef.current.click();
    setAttachOpen(false);
  };

  const onFileChosen = async (file: File) => {
    if (!active) return;
    setUploading(true);
    const up = await uploadChatFile(file);
    setUploading(false);
    if (!up) return;
    await sendMessage(active.id, "", {
      kind: pendingKind.current,
      url: up.path,
      name: up.name,
      mime: up.mime,
      size: up.size,
    });
  };

  const shareContact = async (c: ChatContact) => {
    if (!active) return;
    await sendMessage(active.id, `${c.name}\n${c.email}${c.company ? `\n${c.company}` : ""}`, {
      kind: "contact",
      url: "",
      name: c.name,
      mime: "text/vcard",
      size: 0,
    });
    setAttachOpen(false);
  };

  const { startCall: placeCall, startGroupCall, busy: callBusy } = useCalls();

  /** Place a real call (Stage 1 backend + LiveKit) — one-to-one or group. */
  const startCall = async (mode: CallType) => {
    setCallMenuOpen(false);
    if (!active || !user) return;
    if (active.kind !== "direct") {
      await startGroupCall(active.id, mode);
      return;
    }
    const peer = peerOf(active.members);
    if (!peer) {
      setCallHint("This conversation has nobody to call yet.");
      window.setTimeout(() => setCallHint(null), 3500);
      return;
    }
    await placeCall(peer.userId, mode);
  };


  const handleDownload = (m: ChatMessage) => {
    if (m.attachmentUrl) {
      window.open(m.attachmentUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleForward = async (targetChannelId: string) => {
    if (!forwardingMessage) return;
    await sendMessage(targetChannelId, forwardingMessage.body, {
      kind: forwardingMessage.kind,
      url: forwardingMessage.attachmentUrl ?? "",
      name: forwardingMessage.attachmentName ?? "",
      mime: forwardingMessage.attachmentMime ?? "application/octet-stream",
      size: forwardingMessage.attachmentSize ?? 0,
    });
    setForwardingMessage(null);
  };

  const toggleStar = (messageId: string) => {
    setStarredMessages((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId],
    );
  };

  const headerTitle = active ? titleOf(active) : "No conversation";
  const activePeer = active?.kind === "direct" ? peerOf(active.members) : undefined;
  const peerOnline = activePeer ? online.includes(activePeer.userId) : false;
  const typingNames = Object.values(typingBy).map((t) => t.name);

  return (
    <PortalShell portal={portal}>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFileChosen(f);
        }}
      />

      <div className="relative -mx-4 -mt-12 -mb-6 min-h-[480px] overflow-hidden border-t border-slate-200/80 bg-white sm:-mx-6 md:grid md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] h-[calc(100dvh-4.0625rem)]">
        {/* Left Sidebar */}
        <div
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col border-r border-slate-100 bg-white",
            mobileView === "chat" ? "hidden md:flex" : "flex",
          )}
        >
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <h2 className="text-[20px] font-bold tracking-tight text-slate-900 md:text-[22px]">Messages</h2>
            <div className="relative flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode("direct");
                  setNewOpen(true);
                }}
                className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-500/40 bg-emerald-50/50 text-emerald-600 transition-colors hover:bg-emerald-100/70"
                aria-label="New Message"
              >
                <SquarePen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarMenuOpen((v) => !v)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Sidebar Menu"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {sidebarMenuOpen && (
                <div className="absolute top-9 right-0 z-30 w-44 rounded-xl border border-slate-100 bg-white p-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setUnreadOnly((v) => !v);
                      setSidebarMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {unreadOnly ? "Show all" : "Unread only"}
                  </button>
                  {canCreateRooms && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("room");
                        setNewOpen(true);
                        setSidebarMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create project room
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations..."
                className="h-8.5 w-full rounded-xl border-slate-200 bg-slate-50/70 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              aria-label="Filter unread"
              className={cn(
                "grid h-8.5 w-8.5 shrink-0 place-items-center rounded-xl border transition-colors",
                unreadOnly
                  ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                  : "border-slate-200 bg-slate-50/70 text-slate-500 hover:bg-slate-100",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-2.5">
            <div className="space-y-2.5 pt-1 pb-2">
              {/* Client Rooms */}
              <CollapsibleSectionHeader
                label="CLIENT ROOMS"
                count={clientRooms.length}
                open={openSections.client}
                onToggle={() => toggleSection("client")}
                {...(canCreateRooms
                  ? {
                      onAdd: () => {
                        setMode("client");
                        setNewOpen(true);
                      },
                    }
                  : {})}
              />
              {openSections.client && (
                <div className="space-y-0.5">
                  {clientRooms.length === 0 && <p className="px-3 py-1 text-xs text-slate-400">No client rooms.</p>}
                  {clientRooms.map((c) => {
                    const last = lastOf(c.id);
                    return (
                      <ReferenceChannelRow
                        key={c.id}
                        name={c.name}
                        subtitle={last ? `${last.authorName.split(" ")[0]}: ${preview(last)}` : "No messages yet"}
                        trailingTime={last ? time(last.at) : undefined}
                        unread={unreadFor(c.id)}
                        active={c.id === active?.id}
                        onClick={() => {
                          setActiveId(c.id);
                          setMobileView("chat");
                        }}
                        icon={
                          <div
                            className={cn(
                              "flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              getAvatarBg(c.name),
                            )}
                          >
                            {getInitials(c.name)}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}

              {/* Task / Project Rooms */}
              <CollapsibleSectionHeader
                label="TASK / PROJECT ROOMS"
                count={rooms.length}
                open={openSections.task}
                onToggle={() => toggleSection("task")}
                {...(canCreateRooms
                  ? {
                      onAdd: () => {
                        setMode("room");
                        setNewOpen(true);
                      },
                    }
                  : {})}
              />
              {openSections.task && (
                <div className="space-y-0.5">
                  {rooms.length === 0 && <p className="px-3 py-1 text-xs text-slate-400">No task rooms.</p>}
                  {rooms.map((c) => {
                    const last = lastOf(c.id);
                    return (
                      <ReferenceChannelRow
                        key={c.id}
                        name={c.name}
                        subtitle={last ? `${last.authorName.split(" ")[0]}: ${preview(last)}` : "New campaign brief"}
                        trailingTime={last ? dayLabel(last.at) : undefined}
                        unread={unreadFor(c.id)}
                        active={c.id === active?.id}
                        onClick={() => {
                          setActiveId(c.id);
                          setMobileView("chat");
                        }}
                        icon={
                          <div
                            className={cn(
                              "flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
                              getAvatarBg(c.name),
                            )}
                          >
                            <Folder className="h-4 w-4 fill-white/20" />
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}

              {/* Direct Messages */}
              <CollapsibleSectionHeader
                label="DIRECT MESSAGES"
                count={directs.length}
                open={openSections.dm}
                onToggle={() => toggleSection("dm")}
                onAdd={() => {
                  setMode("direct");
                  setNewOpen(true);
                }}
              />
              {openSections.dm && (
                <div className="space-y-0.5">
                  {directs.length === 0 && <p className="px-3 py-1 text-xs text-slate-400">No direct messages.</p>}
                  {directs.map((c) => {
                    const last = lastOf(c.id);
                    const peer = peerOf(c.members);
                    const label = peer?.name ?? c.name;
                    return (
                      <ReferenceChannelRow
                        key={c.id}
                        name={label}
                        subtitle={last ? preview(last) : "Start the conversation"}
                        trailingTime={last ? relative(last.at) : undefined}
                        unread={unreadFor(c.id)}
                        active={c.id === active?.id}
                        onClick={() => {
                          setActiveId(c.id);
                          setMobileView("chat");
                        }}
                        icon={
                          <div
                            className={cn(
                              "flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              getAvatarBg(label),
                            )}
                          >
                            {getInitials(label)}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}

              {/* Archived */}
              {archived.length > 0 && (
                <>
                  <CollapsibleSectionHeader
                    label="ARCHIVED"
                    count={archived.length}
                    open={openSections.archived}
                    onToggle={() => toggleSection("archived")}
                  />
                  {openSections.archived && (
                    <div className="space-y-0.5">
                      {archived.map((c) => (
                        <ReferenceChannelRow
                          key={c.id}
                          name={titleOf(c)}
                          subtitle="Archived conversation"
                          trailingTime=""
                          unread={0}
                          active={c.id === active?.id}
                          onClick={() => {
                            setActiveId(c.id);
                            setMobileView("chat");
                          }}
                          icon={
                            <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                              <Archive className="h-4 w-4" />
                            </div>
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-slate-100 bg-white p-2.5">
            <button
              type="button"
              onClick={() => {
                setMode("direct");
                setNewOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50/70"
            >
              <span>Start a new conversation</span>
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right Chat Area */}
        <div
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col bg-[#efeae2]",
            mobileView === "list" ? "hidden md:flex" : "flex",
          )}
        >
          {/* Header */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/60 bg-[#f0f2f5] px-4 md:h-15 md:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 hover:bg-slate-200/60 md:hidden"
                aria-label="Back to conversations"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm md:h-9.5 md:w-9.5",
                  getAvatarBg(headerTitle),
                )}
              >
                {getInitials(headerTitle)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-xs font-bold text-slate-900 md:text-sm">{headerTitle}</h3>
                  <Lock className="h-3 w-3 shrink-0 text-slate-400" />
                </div>
                <p className="truncate text-[10px] text-slate-500 md:text-[11px]">
                  {typingNames.length > 0 ? (
                    <span className="font-medium text-emerald-600">
                      {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
                    </span>
                  ) : active ? (
                    `${activePeer ? (peerOnline ? "Online" : "Offline") : "Active"} · ${active.members.length} participants`
                  ) : (
                    "Select a conversation"
                  )}
                </p>
              </div>
            </div>

            <div className="relative flex items-center gap-1">
              <button
                type="button"
                aria-label="Participants"
                disabled={!active}
                onClick={() => setParticipantsOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300/80 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              >
                <Users className="h-3.5 w-3.5 text-slate-500" />
                <span>{active?.members.length ?? 0}</span>
              </button>
              <div className="relative">
                <button
                  type="button"
                  aria-label="Start a call"
                  disabled={!active || callBusy}
                  onClick={() => setCallMenuOpen((v) => !v)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300/80 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                >
                  <Phone className="h-3.5 w-3.5" />
                </button>
                {callMenuOpen && (
                  <div className="absolute right-0 top-9 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xl">
                    <button
                      type="button"
                      onClick={() => void startCall("audio")}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Phone className="h-3.5 w-3.5 text-emerald-600" />{" "}
                      {active && active.kind !== "direct" ? "Group audio call" : "Audio call"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void startCall("video")}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Video className="h-3.5 w-3.5 text-emerald-600" />{" "}
                      {active && active.kind !== "direct" ? "Group video call" : "Video call"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void startCall("screen_share")}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <MonitorUp className="h-3.5 w-3.5 text-emerald-600" /> Screen share
                    </button>
                  </div>
                )}
                {callHint && (
                  <div className="absolute right-0 top-9 z-30 w-52 rounded-xl border border-slate-200 bg-white p-2.5 text-[11px] font-semibold text-slate-600 shadow-xl">
                    {callHint}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="More options"
                disabled={!active}
                onClick={() => setRoomMenuOpen((v) => !v)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300/80 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>

              {roomMenuOpen && active && (
                <div className="absolute top-10 right-0 z-30 w-44 rounded-xl border border-slate-100 bg-white p-1 shadow-xl">
                  {active.kind === "group" && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setRenameValue(active.name);
                        setRenameOpen(true);
                        setRoomMenuOpen(false);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Rename room
                    </button>
                  )}
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      void archiveChannel(active.id, !active.archivedAt);
                      setRoomMenuOpen(false);
                    }}
                  >
                    {active.archivedAt ? (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                      </>
                    ) : (
                      <>
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Linked Task Banner */}
          {linkedTask && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-white/90 px-4 py-1.5 text-xs text-slate-600 backdrop-blur-sm">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-medium shadow-xs">Linked Task</span>
              <span className="truncate font-medium text-slate-800">{linkedTask.title}</span>
              <Link
                to="/portal/$portal/tasks"
                params={{ portal }}
                className="ml-auto inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline"
              >
                Open Task <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Pinned Banner */}
          {pinnedMessageId && (
            <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-1 text-xs text-emerald-800">
              <Pin className="h-3.5 w-3.5 rotate-45 text-emerald-600" />
              <span className="truncate font-medium">Pinned message</span>
              <button
                type="button"
                onClick={() => setPinnedMessageId(null)}
                className="ml-auto text-[11px] font-bold text-emerald-700 hover:underline"
              >
                Unpin
              </button>
            </div>
          )}

          {/* Messages Scroll Canvas */}
          <ScrollArea
            className="min-h-0 flex-1"
            style={{
              backgroundImage: `radial-gradient(#d1d5db 0.85px, transparent 0.85px)`,
              backgroundSize: "20px 20px",
              backgroundColor: "#efeae2",
            }}
          >
            <div className="space-y-3 px-3 py-3 md:px-6 md:py-4">
              {thread.length === 0 && (
                <div className="py-20 text-center text-xs font-medium text-slate-400">
                  No messages yet. Send a message to start the conversation.
                </div>
              )}

              {thread.map((m, i) => {
                const mine = m.authorId === user?.id;
                const prev = thread[i - 1];
                const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
                const isGroupPeer = !mine && isGroupConversation;
                const isStarred = starredMessages.includes(m.id);

                const isDelivered = peerOnline || m.receipt === "delivered" || m.receipt === "read";
                const isRead = m.read === true || m.receipt === "read";

                return (
                  <div key={m.id} className="space-y-1">
                    {newDay && (
                      <div className="my-2 flex justify-center">
                        <span className="rounded-lg bg-white/90 px-3 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-sm">
                          {dayLabel(m.at)}
                        </span>
                      </div>
                    )}

                    <div
                      className={cn(
                        "group relative flex w-full items-start gap-2",
                        mine ? "justify-end" : "justify-start",
                      )}
                    >
                      {/* Avatar for Client Rooms & Task Rooms */}
                      {isGroupPeer && (
                        <div
                          className={cn(
                            "mt-0.5 flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold shadow-xs",
                            getAvatarBg(m.authorName),
                          )}
                        >
                          {getInitials(m.authorName)}
                        </div>
                      )}

                      {/* Content Bubble Row */}
                      <div className={cn("relative flex items-center gap-1.5", mine ? "flex-row-reverse" : "flex-row")}>
                        <div className="relative">
                          {/* WhatsApp Message Bubble */}
                          <div
                            className={cn(
                              "relative max-w-[85vw] rounded-xl border px-3 pt-2 pb-1.5 text-slate-800 shadow-xs transition-shadow sm:max-w-[480px]",
                              mine
                                ? "rounded-tr-xs bg-[#f4fcf1] border-[#cfe8cc]"
                                : "rounded-tl-xs bg-white border-slate-200",
                              m.reactions.length > 0 && "mb-2.5",
                            )}
                          >
                            {isGroupPeer && (
                              <p className="mb-0.5 text-[11px] font-bold text-emerald-700 leading-tight">
                                {m.authorName}
                              </p>
                            )}

                            {/* Top-Right Dropdown Arrow Button */}
                            <button
                              type="button"
                              aria-label="Message options"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuFor(menuFor === m.id ? null : m.id);
                                setReactFor(null);
                                setFullPickerFor(null);
                              }}
                              className={cn(
                                "message-dropdown-container absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5 hover:text-slate-700",
                                menuFor === m.id && "opacity-100 bg-black/5 text-slate-700",
                              )}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>

                            {/* Dynamic WhatsApp Context Menu */}
                            {menuFor === m.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  "message-dropdown-container absolute top-6 z-40 w-44 rounded-2xl border border-slate-100 bg-white py-1.5 text-slate-700 shadow-2xl animate-in fade-in zoom-in-95 duration-100",
                                  mine ? "right-0" : "left-0",
                                )}
                              >
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50"
                                  onClick={() => {
                                    setReplyingTo(m);
                                    setMenuFor(null);
                                  }}
                                >
                                  <CornerUpLeft className="h-3.5 w-3.5 text-slate-500" />
                                  Reply
                                </button>

                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50"
                                  onClick={() => {
                                    setReactFor(m.id);
                                    setMenuFor(null);
                                  }}
                                >
                                  <Smile className="h-3.5 w-3.5 text-slate-500" />
                                  React
                                </button>

                                {m.attachmentUrl && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50"
                                    onClick={() => {
                                      handleDownload(m);
                                      setMenuFor(null);
                                    }}
                                  >
                                    <Download className="h-3.5 w-3.5 text-slate-500" />
                                    Download
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50"
                                  onClick={() => {
                                    setForwardingMessage(m);
                                    setMenuFor(null);
                                  }}
                                >
                                  <Forward className="h-3.5 w-3.5 text-slate-500" />
                                  Forward
                                </button>

                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50"
                                  onClick={() => {
                                    setPinnedMessageId(pinnedMessageId === m.id ? null : m.id);
                                    setMenuFor(null);
                                  }}
                                >
                                  <Pin className="h-3.5 w-3.5 text-slate-500" />
                                  {pinnedMessageId === m.id ? "Unpin" : "Pin"}
                                </button>

                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium hover:bg-slate-50"
                                  onClick={() => {
                                    toggleStar(m.id);
                                    setMenuFor(null);
                                  }}
                                >
                                  <Star
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      isStarred ? "fill-amber-400 text-amber-400" : "text-slate-500",
                                    )}
                                  />
                                  {isStarred ? "Unstar" : "Star"}
                                </button>

                                <div className="my-1 border-t border-slate-100" />

                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
                                  onClick={() => {
                                    setMenuFor(null);
                                  }}
                                >
                                  <Flag className="h-3.5 w-3.5 text-slate-500" />
                                  Report
                                </button>

                                {mine && !m.deletedAt && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50"
                                    onClick={() => {
                                      void deleteMessage(m.id);
                                      setMenuFor(null);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Message Body Content */}
                            {m.deletedAt ? (
                              <p className="pr-4 text-xs italic text-slate-500">This message was deleted</p>
                            ) : (
                              <div className="space-y-1.5 pr-4 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap">
                                {m.body.startsWith("\u260e") ? (
                                  <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/95 p-2.5 shadow-2xs">
                                    <div
                                      className={cn(
                                        "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                                        /missed|declined|cancelled/i.test(m.body)
                                          ? "bg-rose-50 text-rose-600"
                                          : "bg-emerald-50 text-emerald-600",
                                      )}
                                    >
                                      {/video/i.test(m.body) ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-bold text-slate-800">
                                        {m.body.replace("\u260e ", "").split(" \u00b7 ")[0]}
                                      </p>
                                      <p className="text-[11px] text-slate-500">
                                        {m.body.includes("\u00b7") ? m.body.split(" \u00b7 ")[1] : `From ${m.authorName}`}
                                      </p>
                                    </div>
                                  </div>
                                ) : m.kind === "contact" ? (
                                  <div className="flex items-start gap-2 rounded-xl bg-white/80 p-2 border border-slate-100">
                                    <ContactIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                    <div className="text-xs">{m.body}</div>
                                  </div>
                                ) : (
                                  <>
                                    {m.kind !== "text" && <MessageAttachment message={m} />}
                                    {m.body && <p>{m.body}</p>}
                                  </>
                                )}
                              </div>
                            )}

                            {/* WhatsApp Delivery & Seen Ticks: Grey until the actual receiver opens the thread */}
                            <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                              {isStarred && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                              <span>{time(m.at)}</span>
                              {mine && (
                                <span className={cn(isRead ? "text-[#53bdeb]" : "text-slate-400")}>
                                  {!isDelivered ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <CheckCheck className="h-3.5 w-3.5" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* REACTION BADGES: Bottom-Right for Sender, Bottom-Left for Receiver */}
                          {m.reactions.length > 0 && (
                            <div
                              className={cn(
                                "absolute -bottom-2.5 z-10 flex flex-wrap gap-1",
                                mine ? "right-2 justify-end" : "left-2 justify-start",
                              )}
                            >
                              {m.reactions.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  onClick={() => void toggleReaction(m.id, m.channelId, r.emoji)}
                                  className={cn(
                                    "flex items-center gap-1 rounded-full border border-slate-200/90 bg-white px-1.5 py-0.5 text-xs shadow-sm transition hover:scale-105 active:scale-95",
                                    user &&
                                      r.userIds.includes(user.id) &&
                                      "border-emerald-500/50 bg-emerald-50 text-emerald-700",
                                  )}
                                >
                                  <span className="text-[12px] leading-none">{r.emoji}</span>
                                  {r.userIds.length > 1 && (
                                    <span className="text-[10px] font-bold text-slate-600 leading-none">
                                      {r.userIds.length}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* WhatsApp-Style Hover Smile Reaction Trigger */}
                        <div className="relative">
                          <button
                            type="button"
                            aria-label="React"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactFor(reactFor === m.id ? null : m.id);
                              setMenuFor(null);
                            }}
                            className={cn(
                              "message-reaction-container grid h-7.5 w-7.5 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm opacity-0 transition-opacity hover:text-slate-700 group-hover:opacity-100",
                              reactFor === m.id && "opacity-100 text-slate-700 bg-slate-50",
                            )}
                          >
                            <Smile className="h-4 w-4" />
                          </button>

                          {/* Floating WhatsApp Quick Emoji Pill Bar */}
                          {reactFor === m.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "message-reaction-container absolute -top-10 z-40 flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2 py-1 shadow-xl animate-in fade-in zoom-in-90 duration-100",
                                mine ? "right-0" : "left-0",
                              )}
                            >
                              {WHATSAPP_QUICK_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  className="rounded-full px-1 text-base transition-transform hover:scale-130 active:scale-95"
                                  onClick={() => {
                                    void toggleReaction(m.id, m.channelId, emoji);
                                    setReactFor(null);
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}

                              <button
                                type="button"
                                aria-label="More emojis"
                                onClick={() => setFullPickerFor(fullPickerFor === m.id ? null : m.id)}
                                className="grid h-6 w-6 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          )}

                          {/* Expanded Emoji Grid Menu */}
                          {fullPickerFor === m.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "message-reaction-container absolute -top-48 z-50 h-44 w-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-2xl",
                                mine ? "right-0" : "left-0",
                              )}
                            >
                              <div className="grid grid-cols-6 gap-1 text-lg">
                                {EXPANDED_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"
                                    onClick={() => {
                                      void toggleReaction(m.id, m.channelId, emoji);
                                      setFullPickerFor(null);
                                      setReactFor(null);
                                    }}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          {/* Reply Banner */}
          {replyingTo && (
            <div className="flex items-center justify-between border-t border-slate-200/80 bg-white px-4 py-1.5">
              <div className="border-l-3 border-emerald-600 pl-2.5 text-xs">
                <p className="font-bold text-emerald-700">{replyingTo.authorName}</p>
                <p className="truncate text-slate-500">{replyingTo.body || "Attachment"}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
          )}

          {/* Composer Emoji Picker Drawer */}
          {emojiOpen && (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto border-t border-slate-200/80 bg-white p-2.5 shadow-inner">
              {EXPANDED_EMOJIS.slice(0, 36).map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-lg p-1 text-lg hover:bg-slate-100"
                  onClick={() => setDraft((d) => d + e)}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* Attachments Sheet */}
          {attachOpen && (
            <div className="grid grid-cols-2 gap-2 border-t border-slate-200/80 bg-[#f0f2f5] p-3 sm:grid-cols-5">
              <AttachButton
                icon={<FileText className="h-4 w-4" />}
                label="Document"
                onClick={() => pickFile("document", "*/*")}
              />
              <AttachButton
                icon={<ImageIcon className="h-4 w-4" />}
                label="Photos"
                onClick={() => pickFile("image", "image/*")}
              />
              <AttachButton
                icon={<Camera className="h-4 w-4" />}
                label="Camera"
                onClick={() => pickFile("image", "image/*", true)}
              />
              <AttachButton
                icon={<Mic className="h-4 w-4" />}
                label="Audio"
                onClick={() => pickFile("audio", "audio/*")}
              />
              <AttachButton
                icon={<ContactIcon className="h-4 w-4" />}
                label="Contact"
                onClick={() => {
                  setAttachOpen(false);
                  setContactPickerOpen(true);
                }}
              />
            </div>
          )}

          {/* Composer Action Bar */}
          <div className="bg-[#f0f2f5] p-2.5 md:p-3">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!active || !draft.trim()) return;
                const replyPrefix = replyingTo
                  ? `Replying to ${replyingTo.authorName}: "${replyingTo.body.slice(0, 30)}..."\n`
                  : "";
                void sendMessage(active.id, `${replyPrefix}${draft}`);
                setDraft("");
                setEmojiOpen(false);
                setReplyingTo(null);
              }}
            >
              <button
                type="button"
                aria-label="Add emoji"
                disabled={!active}
                onClick={() => setEmojiOpen((v) => !v)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-200/70 disabled:opacity-40"
              >
                <Smile className="h-5 w-5" />
              </button>

              <button
                type="button"
                aria-label="Add attachment"
                disabled={!active || uploading}
                onClick={() => setAttachOpen((v) => !v)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-200/70 disabled:opacity-40"
              >
                <Paperclip className="h-5 w-5 rotate-45" />
              </button>

              <div className="relative flex-1">
                <input
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    broadcastTyping();
                  }}
                  placeholder={uploading ? "Uploading attachment..." : "Type a message"}
                  disabled={!active}
                  className="h-10 w-full rounded-xl border border-white bg-white px-4 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                aria-label="Send message"
                disabled={!active || !draft.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#008f72] disabled:opacity-40 disabled:hover:bg-[#00a884]"
              >
                <Send className="h-4 w-4 -translate-x-0.5 translate-y-0.5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Forwarding Modal */}
      <Dialog open={!!forwardingMessage} onOpenChange={(open) => !open && setForwardingMessage(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Forward message to</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 space-y-1 overflow-y-auto p-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void handleForward(c.id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-100"
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    getAvatarBg(titleOf(c)),
                  )}
                >
                  {getInitials(titleOf(c))}
                </div>
                <span className="truncate text-xs font-semibold text-slate-800">{titleOf(c)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!active) return;
              void renameChannel(active.id, renameValue);
              setRenameOpen(false);
            }}
          >
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              aria-label="Room name"
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share Contact Dialog */}
      <ContactPickerDialog
        open={contactPickerOpen}
        onOpenChange={setContactPickerOpen}
        directory={directory}
        onPick={(c) => void shareContact(c)}
      />

      {/* New Conversation Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="overflow-hidden rounded-2xl border-slate-100 bg-white p-0 shadow-2xl sm:max-w-[440px]">
          <div className="p-6">
            <DialogHeader className="pb-4">
              <DialogTitle className="text-base font-bold text-slate-900">New conversation</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100/90 p-1 text-xs">
              {(canCreateRooms ? (["direct", "room", "client"] as const) : (["direct"] as const)).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-lg py-2 font-medium transition-all text-center",
                    mode === m
                      ? "bg-white text-slate-900 shadow-sm font-semibold"
                      : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  {m === "direct" ? "Direct message" : m === "room" ? "Project room" : "Client room"}
                </button>
              ))}
            </div>

            {mode === "direct" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Pick exactly one person. Only you and them can read this conversation.
                </p>
                <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {directory.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-400">No contacts available.</p>
                  )}
                  {directory.map((c) => (
                    <button
                      key={c.userId}
                      type="button"
                      onClick={() => void openDm(c)}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-slate-50"
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          getAvatarBg(c.name),
                        )}
                      >
                        {getInitials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900 leading-tight">{c.name}</p>
                        <p className="truncate text-[11px] text-slate-400 leading-tight mt-0.5">
                          {c.company || c.email}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {roleLabel[c.role]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <form
                className="mt-4 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const id = await createChannel(roomName, roomMembers, {
                    roomType: mode === "client" ? "client" : "task",
                  });
                  if (id) {
                    setActiveId(id);
                    setNewOpen(false);
                    setRoomName("");
                    setRoomMembers([]);
                    setMobileView("chat");
                  }
                }}
              >
                <div className="space-y-1.5">
                  <label htmlFor="modal-room-name" className="text-xs font-semibold text-slate-700">
                    {mode === "client" ? "Client room name" : "Project room name"}
                  </label>
                  <Input
                    id="modal-room-name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder={mode === "client" ? "e.g. ABC Corp" : "e.g. Website Redesign"}
                    className="h-10 rounded-xl"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">Select Members</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
                    {directory.map((c) => {
                      const checked = roomMembers.includes(c.userId);
                      return (
                        <label
                          key={c.userId}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            checked={checked}
                            onChange={(e) =>
                              setRoomMembers((prev) =>
                                e.target.checked ? [...prev, c.userId] : prev.filter((v) => v !== c.userId),
                              )
                            }
                          />
                          <div
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                              getAvatarBg(c.name),
                            )}
                          >
                            {getInitials(c.name)}
                          </div>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.name}</span>
                          <span className="text-[10px] text-slate-400">{roleLabel[c.role]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setNewOpen(false)} className="rounded-xl">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700"
                    disabled={!roomName.trim() || roomMembers.length === 0}
                  >
                    {mode === "client" ? "Create Client Room" : "Create Project Room"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Participants Sheet */}
      <Dialog open={participantsOpen} onOpenChange={setParticipantsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Participants ({active?.members.length ?? 0})</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {(active?.members ?? []).map((id) => {
              const isSelf = id === user?.id;
              const contact = directory.find((d) => d.userId === id);
              const name = isSelf ? `${user?.name} (You)` : (contact?.name ?? "Member");
              return (
                <div key={id} className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs">
                  <div className="relative">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                        getAvatarBg(name),
                      )}
                    >
                      {getInitials(name)}
                    </div>
                    {online.includes(id) && (
                      <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{name}</span>
                  {contact && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {roleLabel[contact.role]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </PortalShell>
  );
}

function ContactPickerDialog({
  open,
  onOpenChange,
  directory,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  directory: ChatContact[];
  onPick: (c: ChatContact) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share a contact</DialogTitle>
        </DialogHeader>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
          {directory.map((c) => (
            <button
              key={c.userId}
              type="button"
              onClick={() => {
                onPick(c);
                onOpenChange(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  getAvatarBg(c.name),
                )}
              >
                {getInitials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">{c.name}</p>
                <p className="truncate text-[10px] text-slate-400">{c.company || c.email}</p>
              </div>
              <span className="text-[10px] font-semibold text-slate-400">{roleLabel[c.role]}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CollapsibleSectionHeader({
  label,
  count,
  open,
  onToggle,
  onAdd,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2 pt-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-500 hover:text-slate-800"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span>{label}</span>
        <span className="text-slate-400">{count}</span>
      </button>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${label}`}
          className="grid h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ReferenceChannelRow({
  name,
  subtitle,
  trailingTime,
  icon,
  unread,
  active,
  onClick,
}: {
  name: string;
  subtitle?: string | undefined;
  trailingTime?: string | undefined;
  icon: React.ReactNode;
  unread: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors",
        active ? "bg-[#e8f8f0] text-slate-900" : "hover:bg-slate-50/80 text-slate-700",
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <p className="truncate text-[13px] font-bold text-slate-900 leading-none">{name}</p>
          {trailingTime && <span className="shrink-0 text-[10px] font-medium text-slate-400">{trailingTime}</span>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-1">
          <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
          {unread > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#10b981] px-1 text-[9px] font-bold text-white shadow-sm">
              {unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function AttachButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">{icon}</span>
      {label}
    </button>
  );
}

export default MessagesPage;
