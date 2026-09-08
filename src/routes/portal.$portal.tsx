import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import { isPortal, loginPathFor } from "@/lib/portal-nav";

export const Route = createFileRoute("/portal/$portal")({
  component: PortalLayout,
});

function PortalLayout() {
  const { portal } = Route.useParams();
  const { user, ready } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!isPortal(portal)) {
      navigate({ to: "/", replace: true });
      return;
    }
    if (!user) {
      navigate({ to: loginPathFor(portal), replace: true });
      return;
    }
    // Role check: a client account can never open the team or admin portal.
    if (user.portal !== portal) {
      navigate({ to: "/portal/$portal", params: { portal: user.portal }, replace: true });
    }
  }, [ready, user, portal, navigate]);

  if (!ready || !user || !isPortal(portal) || user.portal !== portal) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return <Outlet />;
}
