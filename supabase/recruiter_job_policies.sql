alter table public.jobs enable row level security;

drop policy if exists "Recruiters can insert their own jobs" on public.jobs;
drop policy if exists "Recruiters can update their own jobs" on public.jobs;
drop policy if exists "Recruiters can delete their own jobs" on public.jobs;

create policy "Recruiters can insert their own jobs"
on public.jobs
for insert
to authenticated
with check (
  recruiter_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Recruiters can update their own jobs"
on public.jobs
for update
to authenticated
using (
  recruiter_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
)
with check (
  recruiter_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create policy "Recruiters can delete their own jobs"
on public.jobs
for delete
to authenticated
using (
  recruiter_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);
