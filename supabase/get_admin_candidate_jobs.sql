create or replace function public.get_admin_candidate_jobs(p_candidate_id uuid)
returns table (
    job_id uuid,
    recruiter_id uuid,
    job_content jsonb,
    job_embedding text
)
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

    return query
    select
        jobs.id as job_id,
        jobs.recruiter_id,
        jobs.content as job_content,
        case
            when jobs.embedding is null then null
            else jobs.embedding::text
        end as job_embedding
    from public.applications as applications
    join public.jobs as jobs
        on jobs.id = applications.job_id
    where applications.candidate_id = p_candidate_id;
end;
$$;

revoke all on function public.get_admin_candidate_jobs(uuid) from public;
grant execute on function public.get_admin_candidate_jobs(uuid) to authenticated;
