-- CV parse audit log — GDPR & EU AI Act traceability
-- Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.cv_parse_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  profile_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  input_char_count   INTEGER,
  output_field_names TEXT[],
  model_id           TEXT,
  prompt_version     TEXT,
  success            BOOLEAN NOT NULL,
  error_message      TEXT
);

-- Only the owning user and admins can read their own log rows.
ALTER TABLE public.cv_parse_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_parse_logs: owner read"
  ON public.cv_parse_logs FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "cv_parse_logs: owner insert"
  ON public.cv_parse_logs FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR profile_id IS NULL);

-- Retention: auto-delete rows older than 2 years (GDPR storage limitation).
-- Requires pg_cron. Schedule daily: SELECT cron.schedule('delete-old-cv-logs', '0 3 * * *',
--   $$DELETE FROM public.cv_parse_logs WHERE created_at < now() - INTERVAL '2 years'$$);
