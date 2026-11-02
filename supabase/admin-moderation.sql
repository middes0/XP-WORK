-- NEXAP — Etapa 3: moderação de anúncios e denúncias
-- Execute no SQL Editor após schema.sql e admin-panel.sql.
-- Todas as operações validam a permissão no banco.

create or replace function public.nexap_admin_list_reports()
returns table(report_id uuid,reason text,details text,status text,created_at timestamptz,listing_id uuid,listing_title text,listing_status text,reporter_name text,reporter_email text)
language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_nexap_admin() then raise exception 'Acesso negado.'; end if;
 return query select r.id,r.reason,r.details,r.status,r.created_at,r.listing_id,l.title,l.status,
 coalesce(p.display_name,u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','Usuário NEXAP'),
 coalesce(u.email::text,'E-mail indisponível')
 from public.reports r left join public.listings l on l.id=r.listing_id
 left join auth.users u on u.id=r.reporter_id left join public.profiles p on p.id=r.reporter_id
 order by case r.status when 'pending' then 0 when 'reviewing' then 1 else 2 end,r.created_at desc limit 300;
end;$$;
revoke all on function public.nexap_admin_list_reports() from public;
grant execute on function public.nexap_admin_list_reports() to authenticated;

create or replace function public.nexap_admin_list_listings()
returns table(listing_id uuid,title text,description text,status text,created_at timestamptz,owner_name text,owner_email text,category_name text,price_label text,price numeric,reports_count bigint)
language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_nexap_admin() then raise exception 'Acesso negado.'; end if;
 return query select l.id,l.title,l.description,l.status,l.created_at,
 coalesce(p.display_name,u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','Usuário NEXAP'),
 coalesce(u.email::text,'E-mail indisponível'),c.name,l.price_label,l.price,
 (select count(*) from public.reports r where r.listing_id=l.id)
 from public.listings l left join auth.users u on u.id=l.owner_id
 left join public.profiles p on p.id=l.owner_id left join public.categories c on c.id=l.category_id
 order by l.created_at desc limit 300;
end;$$;
revoke all on function public.nexap_admin_list_listings() from public;
grant execute on function public.nexap_admin_list_listings() to authenticated;

create or replace function public.nexap_admin_update_report(p_report_id uuid,p_status text,p_remove_listing boolean default false)
returns void language plpgsql security definer set search_path=''
as $$
declare v_listing_id uuid;
begin
 if not public.is_nexap_admin() then raise exception 'Acesso negado.'; end if;
 if p_status not in ('reviewing','resolved','dismissed') then raise exception 'Situação de denúncia inválida.'; end if;
 select r.listing_id into v_listing_id from public.reports r where r.id=p_report_id;
 if not found then raise exception 'Denúncia não encontrada.'; end if;
 if p_remove_listing and v_listing_id is null then raise exception 'Denúncia sem anúncio vinculado.'; end if;
 update public.reports set status=p_status where id=p_report_id;
 if p_remove_listing then update public.listings set status='removed' where id=v_listing_id; end if;
end;$$;
revoke all on function public.nexap_admin_update_report(uuid,text,boolean) from public;
grant execute on function public.nexap_admin_update_report(uuid,text,boolean) to authenticated;

create or replace function public.nexap_admin_update_listing(p_listing_id uuid,p_status text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_nexap_admin() then raise exception 'Acesso negado.'; end if;
 if p_status not in ('published','paused','removed') then raise exception 'Situação de anúncio inválida.'; end if;
 update public.listings set status=p_status where id=p_listing_id;
 if not found then raise exception 'Anúncio não encontrado.'; end if;
end;$$;
revoke all on function public.nexap_admin_update_listing(uuid,text) from public;
grant execute on function public.nexap_admin_update_listing(uuid,text) to authenticated;
