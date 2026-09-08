import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Bell, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Magsmen Portal — Realtime Task Management for Client & Delivery Teams" },
      {
        name: "description",
        content:
          "Magsmen Portal is a realtime task management platform with client, team and admin portals, ClickUp two-way sync, analytics and activity feeds.",
      },
      { property: "og:title", content: "Magsmen Portal — Realtime Task Management Platform" },
      {
        property: "og:description",
        content:
          "Three portals, task CRUD, ClickUp two-way sync, notifications and analytics in one responsive workspace.",
      },
    ],
  }),
  component: Landing,
});

const portals = [
  {
    key: "client",
    title: "Client Portal",
    body: "Follow delivery progress, approve work and raise new requests.",
    icon: Users,
  },
  {
    key: "team",
    title: "Team Portal",
    body: "Own the board, move tasks forward and stay in sync with clients.",
    icon: BarChart3,
  },
  {
    key: "admin",
    title: "Admin Portal",
    body: "Govern users, roles, workspaces and the ClickUp integration.",
    icon: ShieldCheck,
  },
] as const;

const features = [
  { icon: RefreshCw, title: "ClickUp two-way sync", body: "Push and pull task state on a schedule or on demand." },
  { icon: Search, title: "Global search", body: "Find any task, client or assignee from every screen." },
  { icon: Bell, title: "Realtime notifications", body: "Status changes and sync results land instantly." },
  { icon: BarChart3, title: "Analytics", body: "Status pie charts, priority mix and recent activity." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient">
            <BrandMark className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="font-display text-lg font-bold">Magsmen Portal</span>
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Get started</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          Realtime delivery workspace
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl leading-tight font-bold sm:text-6xl">
          One task platform for your clients, your team and your admins.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Magsmen Portal brings task CRUD, ClickUp two-way sync, analytics, notifications and role-aware
          portals into a single responsive workspace.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to="/signup">
              Create an account <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/login">Explore the demo</Link>
          </Button>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {portals.map((p) => (
            <Link
              key={p.key}
              to="/login"
              search={{ portal: p.key }}
              className="surface-card group p-5 transition-transform hover:-translate-y-0.5"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-gradient">
                <p.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{p.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Enter portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Magsmen Portal · demo logins are listed on the sign-in page.
      </footer>
    </div>
  );
}
