import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout, SubmitButton } from "@/components/auth-layout";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Magsmen Portal" },
      { name: "description", content: "Choose a new password for your Magsmen Portal account." },
      { property: "og:title", content: "Set a new password — Magsmen Portal" },
      { property: "og:description", content: "Complete your Magsmen Portal password reset." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword, user } = useApp();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setError("");
    toast.success(res.message);
    void navigate({
      to: user ? "/portal/$portal" : "/client/login",
      ...(user ? { params: { portal: user.portal } } : {}),
    });
  };

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Choose a strong password you have not used before."
      footer={<span>Reset links expire after a short time — request a new one if this fails.</span>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <SubmitButton disabled={busy}>{busy ? "Saving…" : "Update password"}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
