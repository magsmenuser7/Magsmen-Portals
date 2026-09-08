-- enums
CREATE TYPE public.app_role AS ENUM ('client','team','admin');
CREATE TYPE public.task_status AS ENUM ('todo','in_progress','in_review','completed','rejected');
CREATE TYPE public.task_priority AS ENUM ('low','normal','high','urgent');
CREATE TYPE public.sync_status AS ENUM ('synced','pending','failed');

-- users
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text,
  role public.app_role NOT NULL DEFAULT 'client',
  role_title text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  role_title text NOT NULL DEFAULT '',
  is_super_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_ref text NOT NULL DEFAULT ('TSK-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0')),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'normal',
  due_date date,
  tags text[] NOT NULL DEFAULT '{}',
  clickup_task_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  status public.task_status,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name text NOT NULL DEFAULT 'System',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_activity TO authenticated;
GRANT ALL ON public.task_activity TO service_role;
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clickup_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  clickup_task_id text,
  sync_status public.sync_status NOT NULL DEFAULT 'pending',
  direction text NOT NULL DEFAULT 'app_to_clickup',
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clickup_sync_log TO authenticated;
GRANT ALL ON public.clickup_sync_log TO service_role;
ALTER TABLE public.clickup_sync_log ENABLE ROW LEVEL SECURITY;

-- helper functions (security definer, avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.my_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.clients WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_team_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.team_members WHERE user_id = auth.uid()
$$;

-- policies: users
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin() OR public.current_app_role() = 'team');
CREATE POLICY "users_insert_own" ON public.users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY "users_delete_admin" ON public.users FOR DELETE TO authenticated USING (public.is_admin());

-- policies: clients
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.current_app_role() = 'team');
CREATE POLICY "clients_insert_own" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "clients_delete_admin" ON public.clients FOR DELETE TO authenticated USING (public.is_admin());

-- policies: team_members (everyone signed in can read; only admins write)
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_members_insert_admin" ON public.team_members FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "team_members_update" ON public.team_members FOR UPDATE TO authenticated
  USING (public.is_admin() OR user_id = auth.uid()) WITH CHECK (public.is_admin() OR user_id = auth.uid());
CREATE POLICY "team_members_delete_admin" ON public.team_members FOR DELETE TO authenticated USING (public.is_admin());

-- policies: tasks
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_admin() OR public.current_app_role() = 'team' OR client_id = public.my_client_id());
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.current_app_role() = 'team' OR client_id = public.my_client_id());
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_admin() OR (public.current_app_role() = 'team' AND assigned_to = public.my_team_member_id()))
  WITH CHECK (public.is_admin() OR (public.current_app_role() = 'team' AND assigned_to = public.my_team_member_id()));
CREATE POLICY "tasks_delete_admin" ON public.tasks FOR DELETE TO authenticated USING (public.is_admin());

-- policies: task_activity
CREATE POLICY "task_activity_select" ON public.task_activity FOR SELECT TO authenticated
  USING (
    public.is_admin() OR public.current_app_role() = 'team'
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.client_id = public.my_client_id())
  );
CREATE POLICY "task_activity_insert" ON public.task_activity FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.current_app_role() = 'team'
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.client_id = public.my_client_id())
  );
CREATE POLICY "task_activity_delete_admin" ON public.task_activity FOR DELETE TO authenticated USING (public.is_admin());

-- policies: clickup_sync_log (internal only: team + admin)
CREATE POLICY "sync_log_select" ON public.clickup_sync_log FOR SELECT TO authenticated
  USING (public.is_admin() OR public.current_app_role() = 'team');
CREATE POLICY "sync_log_insert" ON public.clickup_sync_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.current_app_role() = 'team');
CREATE POLICY "sync_log_update" ON public.clickup_sync_log FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.current_app_role() = 'team')
  WITH CHECK (public.is_admin() OR public.current_app_role() = 'team');
CREATE POLICY "sync_log_delete_admin" ON public.clickup_sync_log FOR DELETE TO authenticated USING (public.is_admin());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tasks_touch_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- new auth user -> profile (+ client row) using signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role public.app_role;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data ->> 'role')::public.app_role, 'client');
  INSERT INTO public.users (id, name, email, phone, role, role_title)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone',
    v_role,
    NEW.raw_user_meta_data ->> 'role_title'
  ) ON CONFLICT (id) DO NOTHING;

  IF v_role = 'client' THEN
    INSERT INTO public.clients (user_id, company_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'company_name', ''))
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF v_role = 'team' THEN
    UPDATE public.team_members SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND user_id IS NULL;
    INSERT INTO public.team_members (user_id, name, email, phone, role_title)
    SELECT NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email), NEW.email,
           NEW.raw_user_meta_data ->> 'phone', COALESCE(NEW.raw_user_meta_data ->> 'role_title', 'Team Member')
    WHERE NOT EXISTS (SELECT 1 FROM public.team_members WHERE lower(email) = lower(NEW.email));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- seed team members
INSERT INTO public.team_members (name, role_title, email, phone, is_super_admin) VALUES
  ('Sandeep N', 'CEO', 'sandeep@magsmen.com', '9703356332', true),
  ('Vamsi', 'Head of Operations', 'vamsi@magsmenn.com', '8309150509', false),
  ('Uma', 'Sr. Operations Associate', 'operations@gmail.com', '9059912674', false),
  ('Ganesh', 'Associate - Strategy, Business & Partnerships', 'ganesh.k@magsmen.com', '9000627772', false),
  ('Sai Krishna', 'Associate - Business & Growth', 'growth@magsmen.com', '7995208294', false),
  ('K Suresh', 'Web Development', 'digital@magsmen.com', '9542076411', false);

-- realtime
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_activity REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity;