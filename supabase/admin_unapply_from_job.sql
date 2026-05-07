create or replace function public.admin_unapply_from_job(p_candidate_id uuid, p_job_id uuid)
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

    delete from public.applications
    where candidate_id = p_candidate_id
      and job_id = p_job_id;

    return found;
end;
$$;

revoke all on function public.admin_unapply_from_job(uuid, uuid) from public;
grant execute on function public.admin_unapply_from_job(uuid, uuid) to authenticated;
