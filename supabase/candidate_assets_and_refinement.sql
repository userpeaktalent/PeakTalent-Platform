create extension if not exists pgcrypto;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.candidate_refinement_chats (
  id uuid primary key default gen_random_uuid(),
  candidate_profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_record_id text,
  transcript jsonb not null default '[]'::jsonb,
  language text not null default 'it' check (language in ('it', 'en')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_profile_id)
);

create table if not exists public.candidate_cvs (
  id uuid primary key default gen_random_uuid(),
  candidate_profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_record_id text,
  bucket_name text not null default 'candidate-cvs',
  file_name text not null,
  file_path text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_profile_id)
);

drop trigger if exists set_candidate_refinement_chats_updated_at on public.candidate_refinement_chats;
create trigger set_candidate_refinement_chats_updated_at
before update on public.candidate_refinement_chats
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_candidate_cvs_updated_at on public.candidate_cvs;
create trigger set_candidate_cvs_updated_at
before update on public.candidate_cvs
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.candidate_refinement_chats enable row level security;
alter table public.candidate_cvs enable row level security;

drop policy if exists "Candidate refinement chats select own or admin" on public.candidate_refinement_chats;
drop policy if exists "Candidate refinement chats insert own or admin" on public.candidate_refinement_chats;
drop policy if exists "Candidate refinement chats update own or admin" on public.candidate_refinement_chats;
drop policy if exists "Candidate refinement chats delete own or admin" on public.candidate_refinement_chats;

create policy "Candidate refinement chats select own or admin"
on public.candidate_refinement_chats
for select
to authenticated
using (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Candidate refinement chats insert own or admin"
on public.candidate_refinement_chats
for insert
to authenticated
with check (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Candidate refinement chats update own or admin"
on public.candidate_refinement_chats
for update
to authenticated
using (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
)
with check (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Candidate refinement chats delete own or admin"
on public.candidate_refinement_chats
for delete
to authenticated
using (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

drop policy if exists "Candidate CV metadata select own or admin" on public.candidate_cvs;
drop policy if exists "Candidate CV metadata insert own or admin" on public.candidate_cvs;
drop policy if exists "Candidate CV metadata update own or admin" on public.candidate_cvs;
drop policy if exists "Candidate CV metadata delete own or admin" on public.candidate_cvs;

create policy "Candidate CV metadata select own or admin"
on public.candidate_cvs
for select
to authenticated
using (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Candidate CV metadata insert own or admin"
on public.candidate_cvs
for insert
to authenticated
with check (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Candidate CV metadata update own or admin"
on public.candidate_cvs
for update
to authenticated
using (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
)
with check (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Candidate CV metadata delete own or admin"
on public.candidate_cvs
for delete
to authenticated
using (
  candidate_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create or replace function public.get_recruiter_candidate_refinement_chat(
  p_job_id uuid,
  p_candidate_profile_id uuid,
  p_candidate_record_id text default null
)
returns table (
  id uuid,
  candidate_profile_id uuid,
  candidate_record_id text,
  transcript jsonb,
  language text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_is_owner boolean := false;
begin
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
  into v_is_admin;

  select exists (
    select 1
    from public.jobs
    where id = p_job_id
      and recruiter_id = auth.uid()
  )
  into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'Only the owning recruiter or an admin can view this refinement chat';
  end if;

  return query
  select
    chats.id,
    chats.candidate_profile_id,
    chats.candidate_record_id,
    chats.transcript,
    chats.language,
    chats.created_at,
    chats.updated_at,
    chats.completed_at
  from public.candidate_refinement_chats as chats
  where chats.candidate_profile_id = p_candidate_profile_id
     or (p_candidate_record_id is not null and chats.candidate_record_id = p_candidate_record_id)
  order by chats.updated_at desc
  limit 1;
end;
$$;

grant execute on function public.get_recruiter_candidate_refinement_chat(uuid, uuid, text) to authenticated;

create or replace function public.get_recruiter_candidate_cv(
  p_job_id uuid,
  p_candidate_profile_id uuid,
  p_candidate_record_id text default null
)
returns table (
  id uuid,
  candidate_profile_id uuid,
  candidate_record_id text,
  bucket_name text,
  file_name text,
  file_path text,
  mime_type text,
  file_size bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_is_owner boolean := false;
begin
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
  into v_is_admin;

  select exists (
    select 1
    from public.jobs
    where id = p_job_id
      and recruiter_id = auth.uid()
  )
  into v_is_owner;

  if not v_is_admin and not v_is_owner then
    raise exception 'Only the owning recruiter or an admin can view this candidate CV';
  end if;

  return query
  select
    cvs.id,
    cvs.candidate_profile_id,
    cvs.candidate_record_id,
    cvs.bucket_name,
    cvs.file_name,
    cvs.file_path,
    cvs.mime_type,
    cvs.file_size,
    cvs.created_at,
    cvs.updated_at
  from public.candidate_cvs as cvs
  where cvs.candidate_profile_id = p_candidate_profile_id
     or (p_candidate_record_id is not null and cvs.candidate_record_id = p_candidate_record_id)
  order by cvs.updated_at desc
  limit 1;
end;
$$;

grant execute on function public.get_recruiter_candidate_cv(uuid, uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-cvs',
  'candidate-cvs',
  false,
  10485760,
  array['application/pdf', 'text/plain']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Candidate CV files select own or admin" on storage.objects;
drop policy if exists "Candidate CV files insert own or admin" on storage.objects;
drop policy if exists "Candidate CV files update own or admin" on storage.objects;
drop policy if exists "Candidate CV files delete own or admin" on storage.objects;

create policy "Candidate CV files select own or admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'candidate-cvs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
);

create policy "Candidate CV files insert own or admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'candidate-cvs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
);

create policy "Candidate CV files update own or admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'candidate-cvs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
)
with check (
  bucket_id = 'candidate-cvs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
);

create policy "Candidate CV files delete own or admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'candidate-cvs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
);
