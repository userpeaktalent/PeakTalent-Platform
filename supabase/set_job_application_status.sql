create or replace function public.set_job_application_status(
    p_candidate_id uuid,
    p_job_id uuid,
    p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_can_manage boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
    )
    or exists (
        select 1
        from public.jobs
        where id = p_job_id
          and recruiter_id = auth.uid()
    )
    or exists (
        select 1
        from public.candidates
        where user_id = auth.uid()
          and user_id = p_candidate_id
    )
    into v_can_manage;

    if not v_can_manage then
        raise exception 'Only the owning recruiter, the candidate, or an admin can update this application status';
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
        update public.applications
        set status = p_status
        where candidate_id = p_candidate_id
          and job_id = p_job_id;
    else
        insert into public.applications (candidate_id, job_id, status)
        values (p_candidate_id, p_job_id, p_status);
    end if;

    return true;
end;
$$;

revoke all on function public.set_job_application_status(uuid, uuid, text) from public;
grant execute on function public.set_job_application_status(uuid, uuid, text) to authenticated;
