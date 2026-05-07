create extension if not exists pgcrypto;

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_email text,
  user_role text,
  title text not null,
  description text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'blocker')),
  url text,
  route text,
  user_agent text,
  viewport text,
  platform text,
  language text,
  console_errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'wont_fix', 'duplicate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bug_reports_created_at_idx on public.bug_reports (created_at desc);
create index if not exists bug_reports_status_idx on public.bug_reports (status);
create index if not exists bug_reports_user_id_idx on public.bug_reports (user_id);

drop trigger if exists set_bug_reports_updated_at on public.bug_reports;
create trigger set_bug_reports_updated_at
before update on public.bug_reports
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.bug_reports enable row level security;

drop policy if exists "Bug reports insert authenticated" on public.bug_reports;
drop policy if exists "Bug reports select own or admin" on public.bug_reports;
drop policy if exists "Bug reports update admin" on public.bug_reports;
drop policy if exists "Bug reports delete admin" on public.bug_reports;

-- Any authenticated user can file a bug. We require user_id to match auth.uid()
-- (or be null, in case the submitter's profile row is missing) to prevent spoofing.
create policy "Bug reports insert authenticated"
on public.bug_reports
for insert
to authenticated
with check (
  user_id is null
  or user_id = auth.uid()
);

-- Users can read their own reports; admins can read all.
create policy "Bug reports select own or admin"
on public.bug_reports
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

-- Only admins can update status / notes.
create policy "Bug reports update admin"
on public.bug_reports
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

-- Only admins can delete.
create policy "Bug reports delete admin"
on public.bug_reports
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);
