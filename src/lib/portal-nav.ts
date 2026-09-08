import {
  LayoutDashboard,
  ListChecks,
  Activity,
  RefreshCw,
  Users,
  Settings,
  MessageSquare,
  CalendarClock,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { Portal } from "@/lib/types";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Menu entry stays visible but its route is paused (feature coming later). */
  disabled?: boolean;
}

export const PORTAL_META: Record<Portal, { name: string; tagline: string }> = {
  client: { name: "Client Portal", tagline: "Track delivery on your projects" },
  team: { name: "Team Portal", tagline: "Execute and collaborate on work" },
  admin: { name: "Admin Portal", tagline: "Govern workspaces, people and sync" },
};

export const PORTALS: Portal[] = ["client", "team", "admin"];

export function isPortal(value: string): value is Portal {
  return (PORTALS as string[]).includes(value);
}

/**
 * Single role-based sidebar config. Same UI and styling for every portal —
 * only the menu entries differ by role.
 */
const NAV_CONFIG: Record<Portal, NavItem[]> = {
  client: [
    { to: "", label: "Dashboard", icon: LayoutDashboard },
    { to: "/tasks", label: "Tasks", icon: ListChecks },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    { to: "/meetings", label: "Meetings", icon: CalendarClock },
    // PRIVACY: the internal team roster is intentionally NOT exposed to clients.
    // Clients only ever see the single team member assigned to their own task.
    // { to: "/people", label: "Team Members", icon: Users },

    { to: "/activity", label: "Activity", icon: Activity },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  team: [
    { to: "", label: "Dashboard", icon: LayoutDashboard },
    { to: "/tasks", label: "Tasks", icon: ListChecks },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    { to: "/meetings", label: "Meetings", icon: CalendarClock },
    { to: "/people", label: "Team Members", icon: Users },
    { to: "/activity", label: "Activity", icon: Activity },
    { to: "/integrations", label: "ClickUp Sync", icon: RefreshCw },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  admin: [
    { to: "", label: "Dashboard", icon: LayoutDashboard },
    { to: "/tasks", label: "Tasks", icon: ListChecks },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/messages", label: "Messages", icon: MessageSquare },
    { to: "/meetings", label: "Meetings", icon: CalendarClock },
    { to: "/people", label: "Users & Roles", icon: Users },
    { to: "/activity", label: "Activity", icon: Activity },
    { to: "/integrations", label: "ClickUp Sync", icon: RefreshCw },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
};

export function navFor(portal: Portal): NavItem[] {
  return NAV_CONFIG[portal];
}

export function loginPathFor(portal: Portal): "/client/login" | "/team/login" | "/admin/login" {
  if (portal === "team") return "/team/login";
  if (portal === "admin") return "/admin/login";
  return "/client/login";
}
