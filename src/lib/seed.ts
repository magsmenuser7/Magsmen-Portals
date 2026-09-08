import type { AppNotification } from "./types";

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

export const seedNotifications: AppNotification[] = [
  {
    id: "NTF-1",
    title: "Task blocked",
    body: "Fix flaky notification worker was marked blocked by Tom Becker.",
    at: iso(0),
    read: false,
    portal: "team",
  },
  {
    id: "NTF-2",
    title: "ClickUp sync complete",
    body: "3 tasks updated from the Delivery workspace.",
    at: iso(0),
    read: false,
    portal: "system",
  },
  {
    id: "NTF-3",
    title: "Review requested",
    body: "Design refresh for client portal dashboard is waiting on your approval.",
    at: iso(-2),
    read: true,
    portal: "client",
  },
];
