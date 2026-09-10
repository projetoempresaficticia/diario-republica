-- =============================================================================
-- 003_rpc_publicar.sql — a professora publica, o Correio avisa sozinho
--
-- Uma mensagem por gerente de empresa visada, remetente é a cédula real
-- do Diário (EP-2026-00004) — nunca uma cédula de sistema inventada,
-- mesmo padrão "honesto" já usado em toda a notificação automática deste
-- ecossistema (AT, Segurança Social, Cartório notificam com a sua própria
-- cédula real).
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh).
-- =============================================================================

create or replace function public.dr_atividade_publicar(
  p_titulo text,
  p_texto text,
  p_tipo text default null,
  p_alvo_todas boolean default true,
  p_alvo_cedulas text[] default '{}',
  p_prazo timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_texto  text := btrim(coalesce(p_texto, ''));
  v_id     uuid := gen_random_uuid();
  v_empresa record;
  v_n       int := 0;
begin
  if not public.fn_e_professor() then
    return jsonb_build_object('ok', false, 'erro', 'Só a professora pode publicar atividades.');
  end if;
  if v_titulo = '' then
    return jsonb_build_object('ok', false, 'erro', 'A atividade precisa de um título.');
  end if;
  if v_texto = '' then
    return jsonb_build_object('ok', false, 'erro', 'A atividade precisa de texto.');
  end if;
  if p_prazo is null then
    return jsonb_build_object('ok', false, 'erro', 'A atividade precisa de um prazo.');
  end if;
  if p_tipo is not null and not exists (
    select 1 from public.atividade_tipos where tipo = p_tipo and ativo = true
  ) then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de atividade desconhecido ou por ativar.');
  end if;
  if not p_alvo_todas and coalesce(array_length(p_alvo_cedulas, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Escolha pelo menos uma empresa, ou marque "todas".');
  end if;

  insert into public.atividades(id, titulo, texto, tipo, alvo_todas, alvo_cedulas, prazo, criada_por)
  values (v_id, v_titulo, v_texto, p_tipo, p_alvo_todas, coalesce(p_alvo_cedulas, '{}'), p_prazo,
          public.fn_minha_cedula());

  -- avisa toda a gente da empresa, não só o gerente — quem trata da
  -- guia de IVA costuma ser o contabilista, não quem gere
  for v_empresa in
    select e.cedula, p.cedula as pessoa_cedula
      from public.empresas e
      join public.pessoas p on p.empresa_id = e.id
     where p_alvo_todas or e.cedula = any(p_alvo_cedulas)
  loop
    insert into public.correio(id, de_cedula, para_cedula, assunto, corpo)
    values (gen_random_uuid(), 'EP-2026-00004', v_empresa.pessoa_cedula,
            'Nova atividade: ' || v_titulo,
            v_texto || E'\n\nPrazo: ' || to_char(p_prazo, 'DD/MM/YYYY') ||
            E'\n\nConsulte em Diário da República.');
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object('id', v_id, 'avisadas', v_n));
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível publicar a atividade.');
end;
$$;

revoke execute on function public.dr_atividade_publicar(text, text, text, boolean, text[], timestamptz)
  from public, anon;
grant execute on function public.dr_atividade_publicar(text, text, text, boolean, text[], timestamptz)
  to authenticated;
