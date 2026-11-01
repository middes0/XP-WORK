-- NEXAP — etapa 3 do painel administrativo: moderação de denúncias
-- Execute este arquivo no SQL Editor do Supabase depois de aplicar
-- supabase/schema.sql e supabase/admin-panel.sql.

create or replace function public.nexap_admin_list_reports()
returns table (
  report_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  listing_id uuid,
  listing_title text,
  listing_status text,
  reporter_name text,
  reporter_email text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_nexap_admin() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    r.id,
    r.reason,
    r.details,
    r.status,
    r.created_at,
    r.listing_id,
    l.title,
    l.status,
    coalesce(p.display_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'Usuário NEXAP'),
    coalesce(u.email::text, 'E-mail indisponível')
  from public.reports r
  left join public.listings l on l.id = r.listing_id
  left join auth.users u on u.id = r.reporter_id
  left join public.profiles p on p.id = r.reporter_id
  order by
    case r.status when 'pending' then 0 when 'reviewing' then 1 else 2 end,
    r.created_at desc;
end;
$$;

revoke all on function public.nexap_admin_list_reports() from public;
grant execute on function public.nexap_admin_list_reports() to authenticated;

-- Atualiza a situação da denúncia e, se solicitado, retira o anúncio da área pública.
-- O anúncio é marcado como "removed"; seu registro não é apagado.
create or replace function public.nexap_admin_update_report(
  p_report_id uuid,
  p_status text,
  p_remove_listing boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_id uuid;
begin
  if not public.is_nexap_admin() then
    raise exception 'Acesso negado.';
  end if;

  if p_status not in ('reviewing', 'resolved', 'dismissed') then
    raise exception 'Situação de denúncia inválida.';
  end if;

  select r.listing_id
  into v_listing_id
  from public.reports r
  where r.id = p_report_id;

  if not found then
    raise exception 'Denúncia não encontrada.';
  end if;

  if p_remove_listing and v_listing_id is null then
    raise exception 'Esta denúncia não está vinculada a um anúncio.';
  end if;

  update public.reports
  set status = p_status
  where id = p_report_id;

  if p_remove_listing then
    update public.listings
    set status = 'removed'
    where id = v_listing_id;
  end if;
end;
$$;

revoke all on function public.nexap_admin_update_report(uuid, text, boolean) from public;
grant execute on function public.nexap_admin_update_report(uuid, text, boolean) to authenticated;
