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

export const Route = createFileRoute('/api/public/clickup/map-users')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return new Response('Unauthorized', { status: 401 });

        const { syncClickupUsers } = await import('@/lib/clickup.server');
        const result = await syncClickupUsers();
        return Response.json(result);
      },
    },
  },
});
