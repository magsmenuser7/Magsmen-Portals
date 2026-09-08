import { createFileRoute } from '@tanstack/react-router';
import { createHmac, timingSafeEqual } from 'crypto';

export const Route = createFileRoute('/api/public/clickup/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();

        // ClickUp signs the payload with the webhook secret when one is configured.
        const secret = process.env['CLICKUP_WEBHOOK_SECRET'];
        if (secret) {
          const signature = request.headers.get('x-signature') ?? '';
          const expected = createHmac('sha256', secret).update(raw).digest('hex');
          const a = Buffer.from(signature);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response('Invalid signature', { status: 401 });
          }
        }

        let payload: { event?: string; task_id?: string; history_items?: Array<{ field?: string; after?: unknown }> };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response('Invalid JSON', { status: 400 });
        }

        const { applyClickupWebhook } = await import('@/lib/clickup.server');
        const result = await applyClickupWebhook(payload);
        return Response.json(result);
      },
    },
  },
});
