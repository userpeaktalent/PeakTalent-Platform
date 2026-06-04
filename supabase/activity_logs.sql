-- Lightweight activity log for admin observability
-- Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  effective_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  effective_email TEXT,
  effective_role TEXT,
  effective_name TEXT,
  is_impersonating BOOLEAN NOT NULL DEFAULT FALSE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  source TEXT NOT NULL,
  function_name TEXT,
  purpose TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_label TEXT,
  model_id TEXT,
  provider_slot TEXT,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_event_type_idx
  ON public.activity_logs (event_type);

CREATE INDEX IF NOT EXISTS activity_logs_entity_idx
  ON public.activity_logs (entity_type, entity_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs: admins read" ON public.activity_logs;
CREATE POLICY "activity_logs: admins read"
  ON public.activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "activity_logs: authenticated insert own rows" ON public.activity_logs;
CREATE POLICY "activity_logs: authenticated insert own rows"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (actor_user_id = auth.uid());
