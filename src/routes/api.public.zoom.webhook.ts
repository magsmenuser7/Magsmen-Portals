/**
 * Legacy Zoom Event Notification endpoint (kept for backwards compatibility).
 * The production endpoint is /api/zoom/webhook — both share the same handler.
 */
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/zoom/webhook')({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, endpoint: 'zoom-webhook', method: 'POST' }),
      POST: async ({ request }) => {
        const { handleZoomWebhook } = await import('@/lib/zoom-webhook.server');
        return handleZoomWebhook(request);
      },
    },
  },
});
