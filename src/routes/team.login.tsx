import { createFileRoute } from "@tanstack/react-router";
import { PortalLogin } from "@/components/portal-auth";

export const Route = createFileRoute("/team/login")({
  head: () => ({
    meta: [
      { title: "Team sign in — Magsmen Portal" },
      { name: "description", content: "Internal team sign in for Magsmen Portal task delivery and ClickUp sync." },
      { property: "og:title", content: "Team sign in — Magsmen Portal" },
      { property: "og:description", content: "Execute and track delivery work." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PortalLogin portal="team" />,
});
