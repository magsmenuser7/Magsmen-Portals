/**
 * Production Zoom Event Notification endpoint.
 *
 * URL: https://client.magsmen.com/api/zoom/webhook
 * Logic lives in `@/lib/zoom-webhook.server` and is loaded inside the handler
 * so no server-only code can leak into a client bundle.
 */
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/zoom/webhook')({
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
