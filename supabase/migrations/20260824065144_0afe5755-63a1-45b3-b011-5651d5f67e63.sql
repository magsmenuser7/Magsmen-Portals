ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_size integer,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE POLICY "chat_messages_update_own" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND public.is_chat_participant(channel_id))
  WITH CHECK (author_id = auth.uid() AND public.is_chat_participant(channel_id));

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.chat_reactions TO authenticated;
GRANT ALL ON public.chat_reactions TO service_role;

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_reactions_select" ON public.chat_reactions
  FOR SELECT TO authenticated USING (public.is_chat_participant(channel_id));
CREATE POLICY "chat_reactions_insert" ON public.chat_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_chat_participant(channel_id));
CREATE POLICY "chat_reactions_delete" ON public.chat_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reads;