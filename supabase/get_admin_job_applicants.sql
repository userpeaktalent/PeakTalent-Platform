create or replace function public.get_admin_job_applicants(p_job_id uuid)
returns table (
    candidate_id uuid,
    status text,
    candidate_user_id uuid,
    candidate_content jsonb,
    candidate_embedding text
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
        applications.candidate_id,
        applications.status,
        candidates.user_id as candidate_user_id,
        candidates.content as candidate_content,
        case
            when candidates.embedding is null then null
            else candidates.embedding::text
        end as candidate_embedding
    from public.applications as applications
    join public.jobs as jobs
        on jobs.id = applications.job_id
    join public.candidates as candidates
        on candidates.user_id = applications.candidate_id
    where jobs.id = p_job_id;
end;
$$;

revoke all on function public.get_admin_job_applicants(uuid) from public;
grant execute on function public.get_admin_job_applicants(uuid) to authenticated;
