-- NEXAP — painel administrativo e controle de permissões
-- Execute no SQL Editor do Supabase depois de confirmar que a conta principal
-- kalewoliveira04@gmail.com já está cadastrada no Auth.

alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

-- Não permitir leitura/escrita direta pelo cliente. Acesso somente por funções seguras.
revoke all on public.admin_roles from anon, authenticated;

create or replace function public.is_nexap_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles r
    where r.user_id = auth.uid()
  );
$$;

revoke all on function public.is_nexap_admin() from public;
grant execute on function public.is_nexap_admin() to authenticated;

-- Registra o administrador principal pelo e-mail informado.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower('kalewoliveira04@gmail.com')
  limit 1;

  if v_user_id is null then
    raise exception 'A conta kalewoliveira04@gmail.com ainda não existe no Auth. Cadastre-se no NEXAP e execute este SQL novamente.';
  end if;

  insert into public.admin_roles (user_id, role)
  values (v_user_id, 'owner')
  on conflict (user_id) do update set role = 'owner';
end;
$$;

-- Lista usuários e dados públicos do perfil. Somente administradores podem executar.
create or replace function public.nexap_admin_list_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_type text,
  bio text,
  avatar_url text,
  created_at timestamptz,
  admin_role text,
  last_sign_in_at timestamptz,
  listings_count bigint
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
    u.id,
    u.email::text,
    coalesce(p.display_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
    coalesce(p.account_type, 'person'),
    coalesce(p.bio, ''),
    p.avatar_url,
    u.created_at,
    r.role,
    u.last_sign_in_at,
    (select count(*) from public.listings l where l.owner_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.admin_roles r on r.user_id = u.id
  order by u.created_at desc;
end;
$$;

revoke all on function public.nexap_admin_list_users() from public;
grant execute on function public.nexap_admin_list_users() to authenticated;

-- Somente o administrador principal pode promover/rebaixar administradores.
create or replace function public.nexap_admin_set_role(p_user_id uuid, p_make_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  select role into v_actor_role
  from public.admin_roles
  where user_id = auth.uid();

  if coalesce(v_actor_role, '') <> 'owner' then
    raise exception 'Somente o administrador principal pode alterar administradores.';
  end if;

  select role into v_target_role
  from public.admin_roles
  where user_id = p_user_id;

  if p_user_id = auth.uid() and not p_make_admin then
    raise exception 'O administrador principal não pode remover a própria permissão.';
  end if;

  if v_target_role = 'owner' and not p_make_admin then
    raise exception 'Não é permitido remover o administrador principal.';
  end if;

  if p_make_admin then
    if not exists (select 1 from auth.users where id = p_user_id) then
      raise exception 'Usuário não encontrado.';
    end if;
    insert into public.admin_roles (user_id, role)
    values (p_user_id, 'admin')
    on conflict (user_id) do update set role = 'admin';
  else
    delete from public.admin_roles
    where user_id = p_user_id and role = 'admin';
  end if;
end;
$$;

revoke all on function public.nexap_admin_set_role(uuid, boolean) from public;
grant execute on function public.nexap_admin_set_role(uuid, boolean) to authenticated;
