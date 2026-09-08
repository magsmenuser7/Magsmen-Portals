ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT 'task';
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS description text;
UPDATE public.chat_channels SET room_type = 'dm' WHERE kind = 'direct' AND room_type <> 'dm';