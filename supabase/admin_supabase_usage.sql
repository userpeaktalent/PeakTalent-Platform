create or replace function public.get_admin_supabase_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
    v_is_admin boolean := false;
    v_database_size_bytes bigint := 0;
    v_storage_size_bytes bigint := 0;
begin
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
    )
    into v_is_admin;

    if not v_is_admin then
        raise exception 'Only admins can inspect Supabase usage';
    end if;

    select pg_database_size(current_database())
    into v_database_size_bytes;

    select coalesce(sum((metadata->>'size')::bigint), 0)
    into v_storage_size_bytes
    from storage.objects;

    return jsonb_build_object(
        'database_size_bytes', v_database_size_bytes,
        'storage_size_bytes', v_storage_size_bytes,
        'measured_at', now()
    );
end;
$$;

grant execute on function public.get_admin_supabase_usage() to authenticated;
