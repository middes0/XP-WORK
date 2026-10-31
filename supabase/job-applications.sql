-- NEXAP — candidaturas e controle de vagas (execute no SQL Editor do Supabase)
alter table public.listings
  add column if not exists job_vacancies_total integer,
  add column if not exists job_vacancies_filled integer not null default 0,
  add column if not exists job_application_deadline date;

alter table public.listings
  drop constraint if exists listings_job_vacancies_check;
alter table public.listings
  add constraint listings_job_vacancies_check
  check (
    (job_vacancies_total is null and job_vacancies_filled = 0)
    or
    (job_vacancies_total between 1 and 500
      and job_vacancies_filled between 0 and job_vacancies_total)
  );

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  candidate_name text not null check (char_length(candidate_name) between 2 and 80),
  candidate_bio text not null default '' check (char_length(candidate_bio) <= 1200),
  experience text not null default '' check (char_length(experience) <= 1600),
  education text not null default '' check (char_length(education) <= 800),
  why_hire text not null check (char_length(why_hire) between 20 and 1600),
  whatsapp text not null check (char_length(whatsapp) between 10 and 20),
  phone text not null default '' check (char_length(phone) <= 20),
  contact_email text not null check (char_length(contact_email) <= 254),
  status text not null default 'received'
    check (status in ('received','reviewing','selected','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, candidate_id)
);

create index if not exists job_applications_listing_idx
  on public.job_applications (listing_id, created_at desc);
create index if not exists job_applications_candidate_idx
  on public.job_applications (candidate_id, created_at desc);

alter table public.job_applications enable row level security;

drop policy if exists "Candidates create own job applications" on public.job_applications;
create policy "Candidates create own job applications"
on public.job_applications for insert to authenticated
with check (
  candidate_id = (select auth.uid())
  and exists (
    select 1 from public.listings l
    join public.categories c on c.id = l.category_id
    where l.id = listing_id and l.status = 'published'
      and c.slug = 'empregos'
      and l.owner_id <> (select auth.uid())
      and l.job_vacancies_total is not null
      and l.job_vacancies_filled < l.job_vacancies_total
  )
);

drop policy if exists "Candidates and employers read applications" on public.job_applications;
create policy "Candidates and employers read applications"
on public.job_applications for select to authenticated
using (
  candidate_id = (select auth.uid())
  or exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "Employers update applications" on public.job_applications;
create policy "Employers update applications"
on public.job_applications for update to authenticated
using (
  exists (select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid()))
)
with check (
  exists (select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid()))
);

create or replace function public.nexap_job_application_capacity()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  listing_owner uuid;
  total_slots integer;
  filled_slots integer;
begin
  select l.owner_id, l.job_vacancies_total, l.job_vacancies_filled
    into listing_owner, total_slots, filled_slots
  from public.listings l
  join public.categories c on c.id = l.category_id
  where l.id = new.listing_id and l.status = 'published' and c.slug = 'empregos'
  for update of l;

  if listing_owner is null or listing_owner = new.candidate_id then
    raise exception 'Esta vaga não está disponível para candidatura.';
  end if;
  if total_slots is null or filled_slots >= total_slots then
    raise exception 'Esta vaga não possui vagas disponíveis.';
  end if;
  return new;
end;
$$;

drop trigger if exists job_application_capacity_check on public.job_applications;
create trigger job_application_capacity_check
before insert on public.job_applications
for each row execute function public.nexap_job_application_capacity();

create or replace function public.nexap_sync_hired_vacancies()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    if new.status = 'selected' and old.status <> 'selected' then
      update public.listings
        set job_vacancies_filled = least(coalesce(job_vacancies_total,0), job_vacancies_filled + 1)
        where id = new.listing_id;
    elsif old.status = 'selected' and new.status <> 'selected' then
      update public.listings
        set job_vacancies_filled = greatest(0, job_vacancies_filled - 1)
        where id = new.listing_id;
    end if;
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists job_application_status_sync on public.job_applications;
create trigger job_application_status_sync
before update of status on public.job_applications
for each row execute function public.nexap_sync_hired_vacancies();

grant select, insert, update on public.job_applications to authenticated;
