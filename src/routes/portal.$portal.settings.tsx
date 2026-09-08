import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/lib/store";
import { isPortal, PORTAL_META } from "@/lib/portal-nav";
import type { Portal } from "@/lib/types";

export const Route = createFileRoute("/portal/$portal/settings")({
  head: () => ({
    meta: [
      { title: "Profile & settings — Magsmen Portal" },
      { name: "description", content: "Manage your Magsmen Portal profile, notifications and session." },
      { property: "og:title", content: "Profile & settings — Magsmen Portal" },
      { property: "og:description", content: "Account preferences for your Magsmen Portal portal." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { portal: raw } = Route.useParams();
  const portal = (isPortal(raw) ? raw : "client") as Portal;
  const { user, signOut, notifications, markAllRead, updateProfile, updatePassword } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    const res = await updateProfile({ name: name.trim(), phone: phone.trim() });
    setSavingProfile(false);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  }

  async function savePassword() {
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    const res = await updatePassword(password);
    setSavingPassword(false);
    if (res.ok) {
      setPassword("");
      setConfirm("");
      toast.success(res.message);
    } else toast.error(res.message);
  }

  return (
    <PortalShell portal={portal} title="Profile & settings" subtitle={PORTAL_META[portal].tagline}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="text-base font-semibold">Profile</h2>
          <div className="mt-4 flex min-w-0 items-center gap-3">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-semibold text-primary-foreground"
              style={{ backgroundColor: user?.avatarColor ?? "#4f7df3" }}
            >
              {user?.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{user?.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Portal</Label>
              <Input id="role" value={PORTAL_META[portal].name} readOnly />
            </div>
            {user?.company && (
              <div className="grid gap-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" defaultValue={user.company} readOnly />
              </div>
            )}
          </div>
          <Button className="mt-4" onClick={saveProfile} disabled={savingProfile || !name.trim()}>
            {savingProfile ? "Saving..." : "Save profile"}
          </Button>

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">Change password</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="pw">New password</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pw2">Confirm password</Label>
                <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </div>
            <Button variant="outline" className="mt-4" onClick={savePassword} disabled={savingPassword || !password}>
              {savingPassword ? "Updating..." : "Update password"}
            </Button>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-base font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            {notifications.filter((n) => !n.read).length} unread
          </p>
          <div className="mt-4 space-y-3">
            {[
              ["Task status changes", true],
              ["ClickUp sync results", true],
              ["Weekly summary email", false],
            ].map(([label, on]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <span className="text-sm">{label}</span>
                <Switch defaultChecked={Boolean(on)} />
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-4 w-full" onClick={markAllRead}>
            Mark all as read
          </Button>
        </div>

        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signing out clears your session on this device.
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => {
              signOut();
              toast.success("Signed out");
              navigate({ to: "/login", search: { portal }, replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </PortalShell>
  );
}
