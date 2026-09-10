-- =============================================================================
-- 005_rpc_declarar_publicas.sql — autodeclaração com anexo conferido, e a
-- montra pública
--
-- O anexo é sempre CONFERIDO (existe mesmo no Storage, na pasta da
-- empresa, com tamanho > 0) — nunca só aceite por declaração. Mesma regra
-- de sempre neste ecossistema: um anexo declarado e nunca verificado é um
-- anexo que não existe.
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh).
-- =============================================================================

create or replace function public.dr_atividade_declarar(
  p_atividade_id uuid,
  p_anexo_caminho text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa text := public.fn_minha_empresa_cedula();
  v_atividade record;
  v_obj record;
  v_caminho_esperado text;
begin
  if v_empresa is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem empresa associada.');
  end if;

  select id, tipo, alvo_todas, alvo_cedulas into v_atividade
    from public.atividades where id = p_atividade_id;
  if v_atividade.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Atividade não encontrada.');
  end if;
  if v_atividade.tipo is not null then
    return jsonb_build_object('ok', false, 'erro', 'Esta atividade verifica-se sozinha — não precisa de anexo.');
  end if;
  if not (v_atividade.alvo_todas or v_empresa = any(v_atividade.alvo_cedulas)) then
    return jsonb_build_object('ok', false, 'erro', 'Esta atividade não é para a sua empresa.');
  end if;

  v_caminho_esperado := v_empresa || '/';
  if left(p_anexo_caminho, length(v_caminho_esperado)) <> v_caminho_esperado then
    return jsonb_build_object('ok', false, 'erro', 'Caminho de anexo inválido.');
  end if;
  select name, metadata into v_obj
    from storage.objects
   where bucket_id = 'atividades' and name = p_anexo_caminho;
  if v_obj.name is null then
    return jsonb_build_object('ok', false, 'erro', 'Ainda não enviou o anexo.');
  end if;
  if coalesce((v_obj.metadata->>'size')::bigint, 0) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'O ficheiro está vazio.');
  end if;

  insert into public.atividade_declaracoes(id, atividade_id, empresa_cedula, anexo_caminho)
  values (gen_random_uuid(), p_atividade_id, v_empresa, p_anexo_caminho)
  on conflict (atividade_id, empresa_cedula)
  do update set anexo_caminho = excluded.anexo_caminho, declarada_em = now();

  return jsonb_build_object('ok', true, 'dados', jsonb_build_object('declarada', true));
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível registar a declaração.');
end;
$$;

revoke execute on function public.dr_atividade_declarar(uuid, text) from public, anon;
grant execute on function public.dr_atividade_declarar(uuid, text) to authenticated;


-- ── montra pública, sem sessão ────────────────────────────────────────
create or replace function public.dr_atividades_publicas()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_linhas jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'id', a.id, 'titulo', a.titulo, 'texto', a.texto, 'tipo', a.tipo,
           'prazo', a.prazo, 'criada_em', a.criada_em, 'alvo_todas', a.alvo_todas)
         order by a.prazo asc)
    into v_linhas
    from public.atividades a
   where a.alvo_todas = true;

  return jsonb_build_object('ok', true, 'dados', coalesce(v_linhas, '[]'::jsonb));
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível listar as atividades.');
end;
$$;

revoke execute on function public.dr_atividades_publicas() from public;
grant execute on function public.dr_atividades_publicas() to anon, authenticated;
