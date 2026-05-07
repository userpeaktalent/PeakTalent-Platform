create or replace function public.delete_recruiter_job_posting(p_job_id uuid)
returns boolean
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
        raise exception 'Only the owning recruiter or an admin can delete this posting';
    end if;

    delete from public.applications
    where job_id = p_job_id;

    begin
        delete from public.job_invitations
        where job_id = p_job_id;
    exception
        when undefined_table then
            null;
    end;

    delete from public.jobs
    where id = p_job_id;

    return true;
end;
$$;

grant execute on function public.delete_recruiter_job_posting(uuid) to authenticated;
