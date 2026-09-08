import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout, SubmitButton } from "@/components/auth-layout";
import { useApp } from "@/lib/store";
import { isPortal } from "@/lib/portal-nav";
import type { Portal } from "@/lib/types";

const searchSchema = z.object({ portal: fallback(z.string(), "client").default("client") });

export const Route = createFileRoute("/forgot-password")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Reset your password — Magsmen Portal" },
      { name: "description", content: "Request a secure password reset link for your Magsmen Portal account." },
      { property: "og:title", content: "Reset your password — Magsmen Portal" },
      { property: "og:description", content: "Password recovery for Magsmen Portal portals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const search = Route.useSearch();
  const portal: Portal = isPortal(search.portal) ? search.portal : "client";
  const { resetPassword } = useApp();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    setBusy(true);
    const res = await resetPassword(email);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setError("");
    setSent(true);
    toast.success(res.message);
  };

  const backTo = portal === "team" ? "/team/login" : portal === "admin" ? "/admin/login" : "/client/login";

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="We'll email you a secure link to choose a new password."
      footer={
        <Link to={backTo} className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>, a reset
          link is on its way. The link opens the page where you set a new password.
        </p>
      ) : (
        <form onSubmit={request} className="space-y-4">
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SubmitButton disabled={busy}>{busy ? "Sending…" : "Send reset link"}</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
