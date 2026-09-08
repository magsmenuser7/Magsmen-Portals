import { createFileRoute, redirect } from "@tanstack/react-router";

/** Public signup exists for the client portal only. */
export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    throw redirect({ to: "/client/signup" });
  },
  component: () => null,
});
