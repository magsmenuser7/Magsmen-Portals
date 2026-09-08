ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS clickup_user_id text;

UPDATE public.clickup_status_map SET clickup_status = 'NEW REQUEST' WHERE internal_status = 'todo';
UPDATE public.clickup_status_map SET clickup_status = 'IN PROGRESS' WHERE internal_status = 'in_progress';
UPDATE public.clickup_status_map SET clickup_status = 'CLIENT REVIEW' WHERE internal_status = 'in_review';
UPDATE public.clickup_status_map SET clickup_status = 'COMPLETED' WHERE internal_status = 'completed';
UPDATE public.clickup_status_map SET clickup_status = 'DECLINED' WHERE internal_status = 'rejected';

INSERT INTO public.clickup_status_map (internal_status, clickup_status)
SELECT v.s::public.task_status, v.c
FROM (VALUES ('todo','NEW REQUEST'),('in_progress','IN PROGRESS'),('in_review','CLIENT REVIEW'),('completed','COMPLETED'),('rejected','DECLINED')) AS v(s,c)
WHERE NOT EXISTS (SELECT 1 FROM public.clickup_status_map m WHERE m.internal_status = v.s::public.task_status);