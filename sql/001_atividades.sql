-- =============================================================================
-- 001_atividades.sql — as três tabelas do motor de atividades do Diário
-- da República.
--
-- Substitui a ideia original da skill pp-orgaos (empresas publicam editais
-- pelo motor genérico orgao_submeter). O Diário passa a ser o canal onde a
-- professora publica atividades obrigatórias, e o app confere sozinho se
-- cada empresa cumpriu, lendo diretamente a tabela do app devido — ver
-- docs/TAREFAS-DIARIO-REPUBLICA.md e docs/PLANO-DIARIO-REPUBLICA.md no
-- repositório de documentação.
--
-- Uma atividade sem `tipo` (null) cai em autodeclaração com anexo
-- conferido no Storage — nunca só aceite por declaração, mesma regra do
-- resto do ecossistema (CV do Talentos, SAF-T da AT).
--
-- Prazo ultrapassado não fecha nada sozinho: não há coluna `encerrada`.
-- A UI compara `prazo < now()` para pintar a atividade a vermelho — é
-- por isso que não existe aqui nenhum agendador nem trigger de fecho.
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh).
-- =============================================================================

create table if not exists public.atividade_tipos (
  tipo             text primary key,
  app_alvo         text not null,
  descricao        text not null,
  link_sugerido    text,
  campos_mostrados text[] not null default '{}',
  ativo            boolean not null default true
);

create table if not exists public.atividades (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  texto         text not null,
  tipo          text references public.atividade_tipos(tipo),
  alvo_todas    boolean not null default true,
  alvo_cedulas  text[] not null default '{}',
  prazo         timestamptz not null,
  criada_por    text not null,
  criada_em     timestamptz not null default now(),
  constraint atividades_alvo_valido check (
    alvo_todas = true or array_length(alvo_cedulas, 1) > 0
  )
);

create table if not exists public.atividade_declaracoes (
  id             uuid primary key default gen_random_uuid(),
  atividade_id   uuid not null references public.atividades(id) on delete cascade,
  empresa_cedula text not null,
  anexo_caminho  text not null,
  declarada_em   timestamptz not null default now(),
  unique (atividade_id, empresa_cedula)
);

alter table public.atividade_tipos       enable row level security;
alter table public.atividades            enable row level security;
alter table public.atividade_declaracoes enable row level security;

-- catálogo: leitura pública (a professora escolhe de uma lista visível;
-- o público também pode ver que tipos de atividade existem), escrita só professor
drop policy if exists "catalogo atividades leitura publica" on public.atividade_tipos;
create policy "catalogo atividades leitura publica"
  on public.atividade_tipos for select using (true);

drop policy if exists "catalogo atividades escrita professor" on public.atividade_tipos;
create policy "catalogo atividades escrita professor"
  on public.atividade_tipos for all
  using (public.fn_e_professor()) with check (public.fn_e_professor());

-- atividades: visível a quem é alvo dela, ou a todos se alvo_todas,
-- ou ao professor (sempre)
drop policy if exists "atividades visiveis a quem e alvo" on public.atividades;
create policy "atividades visiveis a quem e alvo"
  on public.atividades for select
  using (
    alvo_todas = true
    or public.fn_minha_empresa_cedula() = any(alvo_cedulas)
    or public.fn_e_professor()
  );

-- declarações: a própria empresa e o professor
drop policy if exists "declaracoes da minha empresa" on public.atividade_declaracoes;
create policy "declaracoes da minha empresa"
  on public.atividade_declaracoes for select
  using (
    empresa_cedula is not distinct from public.fn_minha_empresa_cedula()
    or public.fn_e_professor()
  );

-- Escrita nenhuma por política nas três: toda a escrita passa por RPC
-- security definer (dr_atividade_publicar, dr_atividade_declarar).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atividades', 'atividades', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "empresa anexa a sua declaracao" on storage.objects;
create policy "empresa anexa a sua declaracao"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'atividades'
    and (storage.foldername(name))[1] = public.fn_minha_empresa_cedula()
  );

drop policy if exists "empresa reescreve a sua declaracao" on storage.objects;
create policy "empresa reescreve a sua declaracao"
  on storage.objects for update
  to authenticated
  using ((storage.foldername(name))[1] = public.fn_minha_empresa_cedula()
         and bucket_id = 'atividades')
  with check ((storage.foldername(name))[1] = public.fn_minha_empresa_cedula()
              and bucket_id = 'atividades');

drop policy if exists "empresa le a sua declaracao" on storage.objects;
create policy "empresa le a sua declaracao"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'atividades'
    and (storage.foldername(name))[1] = public.fn_minha_empresa_cedula()
  );

drop policy if exists "professor le todas as declaracoes" on storage.objects;
create policy "professor le todas as declaracoes"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'atividades' and public.fn_e_professor());
