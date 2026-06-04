-- GDPR data retention & deletion support
-- Run this migration in the Supabase SQL editor.

-- 1. Add inactivity tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactivity_notice_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inactivity_token           TEXT;

-- 2. Index for the daily inactivity cron scan (only rows that already have a notice)
CREATE INDEX IF NOT EXISTS idx_profiles_inactivity_notice
  ON public.profiles (inactivity_notice_sent_at)
  WHERE inactivity_notice_sent_at IS NOT NULL;
