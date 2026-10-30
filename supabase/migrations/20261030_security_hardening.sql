-- NEXAP | Etapa 4 — privilégios mínimos para as tabelas expostas
-- Migração aditiva: não apaga tabelas, registros, usuários, anúncios ou arquivos.
-- Execute manualmente no SQL Editor do Supabase após conferir o projeto.
begin;

-- RLS já está habilitado nas tabelas abaixo. Aqui limitamos também os GRANTs:
-- políticas RLS e privilégios SQL são camadas complementares.
revoke all on table
  public.cities, public.profiles, public.categories, public.listings,
  public.listing_images, public.favorites, public.conversations,
  public.conversation_participants, public.messages, public.reports
from anon, authenticated;

grant select on public.cities, public.categories, public.listings, public.listing_images to anon;
grant select on public.cities, public.categories, public.listings, public.listing_images to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant insert, update, delete on public.listings to authenticated;
grant insert, delete on public.listing_images to authenticated;
grant select, insert, delete on public.favorites to authenticated;

-- As tabelas de conversa permanecem com permissões compatíveis com as políticas
-- existentes, mesmo que o fluxo atual do NEXAP use WhatsApp.
grant select, insert on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;

grant select, insert on public.reports to authenticated;

-- Mantém somente RPCs necessárias e já protegidas pelo auth.uid().
revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
revoke all on function public.add_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.add_conversation_participant(uuid, uuid) to authenticated;

commit;

-- Verificação pós-aplicação (somente leitura):
-- 1) todas as tabelas devem continuar com RLS habilitado;
-- 2) anon só deve ler cidades/categorias/anúncios publicados/imagens visíveis;
-- 3) authenticated só deve editar registros próprios conforme as políticas atuais.
-- Storage: as políticas de storage.objects não são alteradas por esta migração.
-- Confira-as separadamente antes de qualquer alteração, para não bloquear uploads.
