import { BrandMark } from "@/components/brand-mark";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApp } from "@/lib/store";
import { PORTAL_META, navFor, loginPathFor } from "@/lib/portal-nav";
import type { Portal } from "@/lib/types";
import { StatusPill } from "@/components/pills";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function PortalShell({
  portal,
  title,
  subtitle,
  actions,
  children,
}: {
  portal: Portal;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, notifications, markAllRead, signOut, tasks, messages } = useApp();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(() => navFor(portal), [portal]);
  const unread = notifications.filter((n) => !n.read).length;
  const unreadMessages = messages.filter((m) => !m.read).length;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return tasks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q) ||
          t.clientName.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q)),
      )
      .slice(0, 6);
  }, [query, tasks]);

  const handleSignOut = () => {
    void signOut();
    navigate({ to: loginPathFor(portal), replace: true });
  };


  const renderSidebar = (compact: boolean) => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center gap-3 py-5", compact ? "px-3" : "px-5")}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient">
          <BrandMark className="h-5 w-5 text-primary-foreground" />
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">Magsmen Portal</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{PORTAL_META[portal].name}</p>
          </div>
        )}
        <button
          className="ml-auto rounded-md p-1 text-sidebar-foreground/70 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const to = `/portal/${portal}${item.to}`;
          const active = item.to === "" ? pathname === to : pathname.startsWith(to);
          const base = cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            compact && "justify-center px-2",
            active
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          );
          const inner = (
            <>
              <span className="relative shrink-0">
                <item.icon className="h-4 w-4" />
                {!item.disabled && item.label === "Messages" && unreadMessages > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                    {unreadMessages}
                  </span>
                )}
              </span>
              {!compact && <span className="truncate">{item.label}</span>}
              {!compact && item.disabled && (
                <span className="ml-auto shrink-0 rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] text-sidebar-foreground/60">
                  Soon
                </span>
              )}
              {!compact && !item.disabled && active && (
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-70" />
              )}
            </>
          );

          if (item.disabled) {
            return (
              <button
                key={item.label}
                type="button"
                disabled
                title={`${item.label} — coming soon`}
                className={cn(base, "w-full cursor-not-allowed opacity-50")}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              to={`/portal/$portal${item.to}` as "/portal/$portal"}
              params={{ portal }}
              onClick={() => setMobileOpen(false)}
              title={item.label}
              className={base}
            >
              {inner}
            </Link>
          );
        })}

      </nav>

      <div className={cn("m-3 rounded-xl bg-sidebar-accent p-3", compact && "hidden")}>
        <p className="text-xs font-medium text-sidebar-accent-foreground">Switch portal</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["client", "team", "admin"] as Portal[]).map((p) => (
            <Link
              key={p}
              to="/portal/$portal"
              params={{ portal: p }}
              className={cn(
                "rounded-md px-2 py-1 text-xs capitalize transition-colors",
                p === portal
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "bg-sidebar/60 text-sidebar-foreground/70 hover:text-sidebar-foreground",
              )}
            >
              {p}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "hidden shrink-0 transition-all duration-200 lg:block",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div
          className={cn(
            "fixed inset-y-0 transition-all duration-200",
            collapsed ? "w-[4.5rem]" : "w-64",
          )}
        >
          {renderSidebar(collapsed)}
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 shadow-lift">{renderSidebar(false)}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center">
              <button
                className="rounded-md p-2 hover:bg-muted lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                className="hidden rounded-md p-2 hover:bg-muted lg:block"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
            </div>

            <Popover open={results.length > 0}>
              <PopoverTrigger asChild>
                <div className="relative min-w-0 sm:max-w-md">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search tasks, people, clients…"
                    className="h-10 w-full pl-9"
                    aria-label="Search"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(28rem,90vw)] p-1"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {results.map((t) => (
                  <Link
                    key={t.id}
                    to="/portal/$portal/tasks"
                    params={{ portal }}
                    search={{ q: t.title, status: "all", priority: "all" }}
                    onClick={() => setQuery("")}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.id} · {t.assignee}
                      </p>
                    </div>
                    <StatusPill status={t.status} />
                  </Link>
                ))}
              </PopoverContent>
            </Popover>

            <div className="flex shrink-0 items-center justify-end gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="h-5 w-5" />
                    {unread > 0 && (
                      <span className="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                        {unread}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[min(22rem,92vw)] p-0">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <p className="text-sm font-semibold">Notifications</p>
                    <Button variant="ghost" size="sm" onClick={markAllRead}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
                    </Button>
                  </div>
                  <ScrollArea className="h-80">
                    {notifications.length === 0 && (
                      <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p>
                    )}
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "border-b border-border/60 px-3 py-2.5 last:border-0",
                          !n.read && "bg-primary/5",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{n.title}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {timeAgo(n.at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                      </div>
                    ))}
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-primary-foreground"
                    style={{ backgroundColor: user?.avatarColor ?? "#4f7df3" }}
                    aria-label="Account menu"
                  >
                    {user ? user.name.charAt(0) : <UserRound className="h-4 w-4" />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {user?.email}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/portal/$portal/settings" params={{ portal }}>Profile & settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6">
          <div className="mx-auto w-full max-w-7xl">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0">
                {title && <h1 className="truncate text-2xl font-bold sm:text-3xl">{title}</h1>}
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            </div>
            <div className="mt-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
