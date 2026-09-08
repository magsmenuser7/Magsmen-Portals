CREATE POLICY "chat_reads_select_participants" ON public.chat_reads
  FOR SELECT TO authenticated
  USING (public.is_chat_participant(channel_id));