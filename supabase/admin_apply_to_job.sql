create or replace function public.admin_apply_to_job(p_candidate_id uuid, p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
    ) then
        raise exception 'Admin access required';
    end if;

    if not exists (
        select 1
        from public.candidates
        where user_id = p_candidate_id
    ) then
        raise exception 'Candidate not found';
    end if;

    if not exists (
        select 1
        from public.jobs
        where id = p_job_id
    ) then
        raise exception 'Job not found';
    end if;

    if exists (
        select 1
        from public.applications
        where candidate_id = p_candidate_id
          and job_id = p_job_id
    ) then
        return false;
    end if;

    insert into public.applications (candidate_id, job_id, status)
    values (p_candidate_id, p_job_id, 'pending');

    return true;
end;
$$;

revoke all on function public.admin_apply_to_job(uuid, uuid) from public;
grant execute on function public.admin_apply_to_job(uuid, uuid) to authenticated;
