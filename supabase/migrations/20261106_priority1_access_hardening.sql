-- AllXap | Prioridade 1 — endurecimento de permissões de candidaturas
-- Seguro para reaplicação. Não apaga registros, anúncios, perfis ou candidaturas.
-- Execute no SQL Editor do Supabase após conferir o projeto.

begin;

-- O acesso de candidaturas nunca deve ser público.
alter table public.job_applications enable row level security;

revoke all on table public.job_applications from anon, authenticated;

-- Usuários autenticados podem consultar candidaturas próprias ou recebidas
-- em vagas que anunciaram, e enviar a própria candidatura.
grant select, insert on table public.job_applications to authenticated;

-- O anunciante só precisa alterar o status. Os dados pessoais e a associação
-- entre candidatura, candidato e vaga ficam imutáveis pelo cliente.
grant update (status) on table public.job_applications to authenticated;

-- Recria políticas com escopo explícito.
drop policy if exists "Candidates create own job applications" on public.job_applications;
create policy "Candidates create own job applications"
on public.job_applications
for insert
to authenticated
with check (
  candidate_id = (select auth.uid())
  and exists (
    select 1
    from public.listings l
    join public.categories c on c.id = l.category_id
    where l.id = listing_id
      and l.status = 'published'
      and c.slug = 'empregos'
      and l.owner_id <> (select auth.uid())
      and l.job_vacancies_total is not null
      and l.job_vacancies_filled < l.job_vacancies_total
  )
);

drop policy if exists "Candidates and employers read applications" on public.job_applications;
create policy "Candidates and employers read applications"
on public.job_applications
for select
to authenticated
using (
  candidate_id = (select auth.uid())
  or exists (
    select 1
    from public.listings l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "Employers update applications" on public.job_applications;
create policy "Employers update applications"
on public.job_applications
for update
to authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.listings l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
  )
);

-- Triggers internos não precisam ser executáveis diretamente por clientes.
revoke all on function public.nexap_job_application_capacity() from public, anon, authenticated;
revoke all on function public.nexap_sync_hired_vacancies() from public, anon, authenticated;

commit;

-- Verificação pós-aplicação:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='job_applications'
-- ORDER BY grantee, privilege_type;
--
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='job_applications'
-- ORDER BY policyname;
