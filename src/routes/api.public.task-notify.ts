import { createFileRoute } from '@tanstack/react-router';

async function requireUser(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export const Route = createFileRoute('/api/public/task-notify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return new Response('Unauthorized', { status: 401 });

        let body: { taskId?: string; kind?: string };
        try {
          body = (await request.json()) as { taskId?: string; kind?: string };
        } catch {
          return new Response('Invalid JSON', { status: 400 });
        }

        const kind = body.kind;
        if (!body.taskId || (kind !== 'created' && kind !== 'assigned' && kind !== 'status')) {
          return new Response('Invalid payload', { status: 400 });
        }

        const { notifyTaskEvent } = await import('@/lib/email.server');
        const result = await notifyTaskEvent(body.taskId, kind);
        return Response.json(result);
      },
    },
  },
});
