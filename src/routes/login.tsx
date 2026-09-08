import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({ portal: fallback(z.string(), "client").default("client") });

/** Legacy entry point — each portal now has its own sign-in page. */
export const Route = createFileRoute("/login")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: ({ search }) => {
    const portal = ["client", "team", "admin"].includes(search.portal) ? search.portal : "client";
    if (portal === "team") throw redirect({ to: "/team/login" });
    if (portal === "admin") throw redirect({ to: "/admin/login" });
    throw redirect({ to: "/client/login" });
  },
  component: () => null,
});
