import { createFileRoute } from "@tanstack/react-router";
import { PortalLogin } from "@/components/portal-auth";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin sign in — Magsmen Portal" },
      { name: "description", content: "Administrator sign in for Magsmen Portal workspace, users and sync governance." },
      { property: "og:title", content: "Admin sign in — Magsmen Portal" },
      { property: "og:description", content: "Govern workspaces, people and integrations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PortalLogin portal="admin" />,
});
