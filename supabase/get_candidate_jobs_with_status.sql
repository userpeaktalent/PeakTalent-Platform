create or replace function public.get_candidate_jobs_with_status(p_candidate_id uuid default null)
returns table (
    job_id uuid,
    recruiter_id uuid,
    application_status text,
    job_content jsonb,
    job_embedding text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_candidate_id uuid;
    v_is_admin boolean := false;
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
    into v_is_admin;

    v_candidate_id := coalesce(p_candidate_id, auth.uid());

    if not v_is_admin and v_candidate_id <> auth.uid() then
        raise exception 'You can only read your own candidate jobs';
    end if;

    if not v_is_admin and not exists (
        select 1
        from public.candidates
        where user_id = auth.uid()
    ) then
        raise exception 'Candidate access required';
    end if;

    return query
    select
        jobs.id as job_id,
        jobs.recruiter_id,
        applications.status as application_status,
        jobs.content as job_content,
        case
            when jobs.embedding is null then null
            else jobs.embedding::text
        end as job_embedding
    from public.applications as applications
    join public.jobs as jobs
        on jobs.id = applications.job_id
    where applications.candidate_id = v_candidate_id;
end;
$$;

revoke all on function public.get_candidate_jobs_with_status(uuid) from public;
grant execute on function public.get_candidate_jobs_with_status(uuid) to authenticated;
