import { createFileRoute } from "@tanstack/react-router";
import { ClientSignup } from "@/components/portal-auth";

export const Route = createFileRoute("/client/signup")({
  head: () => ({
    meta: [
      { title: "Create a client account — Magsmen Portal" },
      { name: "description", content: "Sign up for the Magsmen Portal client portal and start raising tasks." },
      { property: "og:title", content: "Create a client account — Magsmen Portal" },
      { property: "og:description", content: "Raise tasks and follow delivery in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientSignup,
});
