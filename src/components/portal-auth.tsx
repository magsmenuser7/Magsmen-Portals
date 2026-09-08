import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout, PortalHint, SubmitButton } from "@/components/auth-layout";
import { useApp } from "@/lib/store";
import { PORTAL_META } from "@/lib/portal-nav";
import type { Portal } from "@/lib/types";

/** Shared sign-in card used by /client/login, /team/login and /admin/login. */
export function PortalLogin({ portal }: { portal: Portal }) {
  const navigate = useNavigate();
  const { signIn } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    setBusy(true);
    const res = await signIn(email, password, portal);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setError("");
    toast.success(res.message);
    void navigate({ to: "/portal/$portal", params: { portal } });
  };

  return (
    <AuthLayout
      title={`${PORTAL_META[portal].name} sign in`}
      subtitle="Use the credentials issued for this portal."
      footer={
        portal === "client" ? (
          <>
            New here?{" "}
            <Link to="/client/signup" className="font-medium text-primary hover:underline">
              Create a client account
            </Link>
          </>
        ) : (
          <span>
            Accounts for this portal are created by an administrator. Contact your admin for access.
          </span>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <PortalHint portal={portal} />

        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              search={{ portal }}
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <SubmitButton disabled={busy}>{busy ? "Signing in…" : "Sign in"}</SubmitButton>
      </form>
    </AuthLayout>
  );
}

/** Public sign-up — client portal only. */
export function ClientSignup() {
  const navigate = useNavigate();
  const { signUp } = useApp();
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("Enter a valid email address.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    const res = await signUp(
      {
        name: form.name,
        email: form.email,
        password: form.password,
        company: form.company,
        phone: form.phone,
      },
      "client",
    );
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setError("");
    toast.success(res.message);
    void navigate({ to: "/portal/$portal", params: { portal: "client" } });
  };

  return (
    <AuthLayout
      title="Create your client account"
      subtitle="Raise tasks, follow progress and get email updates at every status change."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/client/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={form.name} onChange={set("name")} maxLength={80} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" value={form.company} onChange={set("company")} maxLength={80} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={form.phone} onChange={set("phone")} maxLength={20} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
            maxLength={255}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            maxLength={72}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <SubmitButton disabled={busy}>{busy ? "Creating account…" : "Create account"}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
