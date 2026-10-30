-- NEXAP | Auditoria somente leitura de segurança Supabase
-- Execute no SQL Editor. Estas consultas NÃO alteram dados nem políticas.

-- 1) RLS habilitado nas tabelas usadas pelo NEXAP.
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  forcerowsecurity as force_rls
from pg_tables
where schemaname = 'public'
  and tablename in (
    'cities','profiles','categories','listings','listing_images',
    'favorites','conversations','conversation_participants','messages','reports'
  )
order by tablename;

-- 2) Políticas ativas e operações cobertas.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public','storage')
  and (
    schemaname = 'storage'
    or tablename in (
      'cities','profiles','categories','listings','listing_images',
      'favorites','conversations','conversation_participants','messages','reports'
    )
  )
order by schemaname, tablename, policyname;

-- 3) Privilégios efetivos básicos nas tabelas públicas.
select
  table_name,
  has_table_privilege('anon', 'public.' || table_name, 'SELECT') as anon_select,
  has_table_privilege('anon', 'public.' || table_name, 'INSERT') as anon_insert,
  has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') as user_select,
  has_table_privilege('authenticated', 'public.' || table_name, 'INSERT') as user_insert,
  has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE') as user_update,
  has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') as user_delete
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'cities','profiles','categories','listings','listing_images',
    'favorites','conversations','conversation_participants','messages','reports'
  )
order by table_name;

-- 4) Bucket de imagens e políticas de Storage (não modifica nada).
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'listing-images';

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
