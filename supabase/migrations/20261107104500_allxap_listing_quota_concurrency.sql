-- Serialize quota checks per account to prevent concurrent publications
-- from exceeding the configured number of active non-job listings.
create or replace function public.enforce_allxap_listing_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_slug text;
  v_limit integer := 3;
  v_plan_limit integer;
  v_count integer;
begin
  if new.status <> 'published' then return new; end if;
  select c.slug into v_category_slug from public.categories c where c.id = new.category_id;
  if v_category_slug = 'empregos' then return new; end if;

  select p.listing_limit into v_plan_limit
  from public.monetization_subscriptions s
  join public.monetization_plans p on p.id = s.plan_id
  where s.user_id = new.owner_id
    and s.status = 'active'
    and (s.starts_at is null or s.starts_at <= now())
    and (s.ends_at is null or s.ends_at > now())
  order by s.ends_at desc nulls first
  limit 1;
  if found then v_limit := coalesce(v_plan_limit, 2147483647); end if;

  perform pg_advisory_xact_lock(hashtext(new.owner_id::text));

  select count(*)::integer into v_count
  from public.listings l
  join public.categories c on c.id = l.category_id
  where l.owner_id = new.owner_id
    and l.status = 'published'
    and c.slug <> 'empregos'
    and (tg_op = 'INSERT' or l.id <> new.id);

  if v_count >= v_limit then
    raise exception 'Seu plano permite até % anúncios ativos. Vagas de emprego continuam gratuitas e não entram nesse limite.', v_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_allxap_listing_quota() from public, anon, authenticated;
