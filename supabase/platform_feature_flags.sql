CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.platform_feature_flags (key, enabled)
VALUES ('email', FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_feature_flags (key, enabled)
VALUES ('candidate_profile_visibility_setting', FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_feature_flags (key, enabled)
VALUES ('seeker_oauth', FALSE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_feature_flags: authenticated read" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags: authenticated read"
  ON public.platform_feature_flags FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "platform_feature_flags: seeker oauth public read" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags: seeker oauth public read"
  ON public.platform_feature_flags FOR SELECT
  TO anon
  USING (key = 'seeker_oauth');

DROP POLICY IF EXISTS "platform_feature_flags: admins insert" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags: admins insert"
  ON public.platform_feature_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "platform_feature_flags: admins update" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags: admins update"
  ON public.platform_feature_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
