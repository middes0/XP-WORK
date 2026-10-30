-- XP WORK — schema inicial do Supabase
-- Execute no SQL Editor de um projeto Supabase novo.
-- Este arquivo prepara a estrutura; não cria nem conecta um projeto automaticamente.

create extension if not exists pgcrypto;

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state_code char(2) not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, state_code)
);

insert into public.cities (name, state_code, slug)
values ('Xapuri', 'AC', 'xapuri-ac')
on conflict (slug) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  account_type text not null default 'person'
    check (account_type in ('person', 'professional', 'business')),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_path text,
  city_id uuid references public.cities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.categories (name, slug, sort_order) values
  ('Serviços', 'servicos', 1),
  ('Comércio', 'comercio', 2),
  ('Classificados', 'classificados', 3),
  ('Entregas', 'entregas', 4),
  ('Empregos', 'empregos', 5),
  ('Eventos', 'eventos', 6)
on conflict (slug) do nothing;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  city_id uuid not null references public.cities(id),
  category_id uuid not null references public.categories(id),
  title text not null check (char_length(title) between 4 and 90),
  description text not null check (char_length(description) between 10 and 3000),
  price numeric(12,2) check (price is null or price >= 0),
  price_label text,
  contact_phone text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'paused', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_public_search_idx
  on public.listings (city_id, category_id, created_at desc)
  where status = 'published';
create index if not exists listings_owner_idx
  on public.listings (owner_id, created_at desc);

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 100),
  details text not null default '' check (char_length(details) <= 1500),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (listing_id is not null or reported_user_id is not null)
);

-- Função SECURITY DEFINER evita recursão nas políticas de participantes.
create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_user_id
  );
$;

revoke all on function public.is_conversation_member(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

-- Ao criar uma conversa, o criador entra automaticamente como participante.
create or replace function public.add_conversation_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversation_participants (conversation_id, user_id)
  values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end;
$;

drop trigger if exists conversations_add_creator on public.conversations;
create trigger conversations_add_creator after insert on public.conversations
for each row execute function public.add_conversation_creator();

-- Participantes existentes podem adicionar outro usuário pela função RPC.
create or replace function public.add_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_conversation_member(p_conversation_id, auth.uid()) then
    raise exception 'Not allowed to add participants to this conversation';
  end if;
  insert into public.conversation_participants (conversation_id, user_id)
  values (p_conversation_id, p_user_id)
  on conflict do nothing;
end;
$;

revoke all on function public.add_conversation_participant(uuid, uuid) from public;
grant execute on function public.add_conversation_participant(uuid, uuid) to authenticated;

-- Atualiza updated_at automaticamente nas tabelas editáveis.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at before update on public.listings
for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.cities enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

-- Dados de referência: leitura pública.
drop policy if exists "Active cities are readable" on public.cities;
create policy "Active cities are readable" on public.cities
for select to anon, authenticated using (is_active = true);

drop policy if exists "Active categories are readable" on public.categories;
create policy "Active categories are readable" on public.categories
for select to anon, authenticated using (is_active = true);

-- Perfis: usuários autenticados podem consultar perfis públicos e editar somente o próprio.
drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
create policy "Profiles are readable by authenticated users" on public.profiles
for select to authenticated using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles
for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Anúncios publicados são públicos; proprietários gerenciam os próprios anúncios.
drop policy if exists "Published listings are public" on public.listings;
create policy "Published listings are public" on public.listings
for select to anon, authenticated using (
  status = 'published' or owner_id = (select auth.uid())
);

drop policy if exists "Users create own listings" on public.listings;
create policy "Users create own listings" on public.listings
for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "Users update own listings" on public.listings;
create policy "Users update own listings" on public.listings
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "Users delete own listings" on public.listings;
create policy "Users delete own listings" on public.listings
for delete to authenticated using (owner_id = (select auth.uid()));

-- Imagens seguem a visibilidade do anúncio e só o dono pode alterá-las.
drop policy if exists "Listing images follow listing visibility" on public.listing_images;
create policy "Listing images follow listing visibility" on public.listing_images
for select to anon, authenticated using (
  exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (l.status = 'published' or l.owner_id = (select auth.uid()))
  )
);

drop policy if exists "Owners manage listing images" on public.listing_images;
create policy "Owners manage listing images" on public.listing_images
for all to authenticated using (
  exists (select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid()))
) with check (
  exists (select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid()))
);

-- Favoritos: cada usuário enxerga e altera apenas os próprios registros.
drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites" on public.favorites
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Conversas: acesso limitado aos participantes.
drop policy if exists "Users create conversations" on public.conversations;
create policy "Users create conversations" on public.conversations
for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "Participants read conversations" on public.conversations;
create policy "Participants read conversations" on public.conversations
for select to authenticated using (
  public.is_conversation_member(id, (select auth.uid()))
);

drop policy if exists "Participants read participant list" on public.conversation_participants;
create policy "Participants read participant list" on public.conversation_participants
for select to authenticated using (
  public.is_conversation_member(conversation_id, (select auth.uid()))
);

drop policy if exists "Conversation creator adds participants" on public.conversation_participants;

drop policy if exists "Participants read messages" on public.messages;
create policy "Participants read messages" on public.messages
for select to authenticated using (
  public.is_conversation_member(conversation_id, (select auth.uid()))
);

drop policy if exists "Participants send messages as themselves" on public.messages;
create policy "Participants send messages as themselves" on public.messages
for insert to authenticated with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id, (select auth.uid()))
);

drop policy if exists "Users read own reports" on public.reports;
create policy "Users read own reports" on public.reports
for select to authenticated using (reporter_id = (select auth.uid()));

drop policy if exists "Users submit reports" on public.reports;
create policy "Users submit reports" on public.reports
for insert to authenticated with check (reporter_id = (select auth.uid()));

-- Não há políticas públicas de escrita para tabelas administrativas.
-- Nunca coloque a chave service_role no frontend.
