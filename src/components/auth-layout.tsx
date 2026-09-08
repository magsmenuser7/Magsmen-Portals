import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PORTAL_META, PORTALS } from "@/lib/portal-nav";
import type { Portal } from "@/lib/types";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient">
            <BrandMark className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold">Magsmen Portal</span>
        </Link>
        <div>
          <h2 className="max-w-sm text-3xl leading-snug font-bold">
            Realtime delivery, one shared source of truth.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-sidebar-foreground/70">
            Client, team and admin portals with task CRUD, ClickUp two-way sync, analytics and
            activity feeds.
          </p>
        </div>
        <div className="rounded-xl bg-sidebar-accent p-4 text-sm">
          <p className="font-medium">Demo accounts</p>
          <p className="mt-1 text-sidebar-foreground/70">client@demo.com · team@demo.com · admin@demo.com</p>
          <p className="text-sidebar-foreground/70">password: demo1234</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient">
              <BrandMark className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold">Magsmen Portal</span>
          </Link>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
          <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function PortalPicker({
  value,
  onChange,
}: {
  value: Portal;
  onChange: (p: Portal) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-1">
      {PORTALS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "rounded-lg px-2 py-2 text-sm font-medium capitalize transition-colors",
            value === p
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function useDemoFill(setEmail: (v: string) => void, setPassword: (v: string) => void) {
  const [used, setUsed] = useState(false);
  return {
    used,
    fill: (portal: Portal) => {
      setEmail(`${portal}@demo.com`);
      setPassword("demo1234");
      setUsed(true);
    },
  };
}

export function PortalHint({ portal }: { portal: Portal }) {
  return <p className="text-xs text-muted-foreground">{PORTAL_META[portal].tagline}</p>;
}

export function SubmitButton({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button type="submit" className="w-full" size="lg" {...props}>
      {children}
    </Button>
  );
}
