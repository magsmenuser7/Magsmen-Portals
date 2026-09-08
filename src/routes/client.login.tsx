import { createFileRoute } from "@tanstack/react-router";
import { PortalLogin } from "@/components/portal-auth";

export const Route = createFileRoute("/client/login")({
  head: () => ({
    meta: [
      { title: "Client sign in — Magsmen Portal" },
      { name: "description", content: "Sign in to the Magsmen Portal client portal to raise and track tasks." },
      { property: "og:title", content: "Client sign in — Magsmen Portal" },
      { property: "og:description", content: "Access your Magsmen Portal client portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PortalLogin portal="client" />,
});
