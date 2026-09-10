-- =============================================================================
-- 006_atividades_multiplos_tipos.sql — uma atividade pode exigir vários
-- tipos ao mesmo tempo (E — todos obrigatórios)
--
-- Decisão do Germano: "publicar vaga" E "pagar salário" na mesma
-- atividade, por exemplo. `atividades.tipo` (um só, nullable) vira
-- `atividades.tipos` (array, pode ser vazio). Sem tipos = autodeclaração
-- com anexo, exatamente como antes — isso não mudou.
--
-- `dr_minhas_atividades` passa a devolver `provas` como um ARRAY
-- uniforme de {tipo, cumprida, prova} — um item por tipo exigido, ou um
-- único item com tipo=null para a autodeclaração. `cumprida` geral só é
-- true quando TODOS os itens estão cumpridos.
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh).
-- =============================================================================

-- ── 1. a tabela ───────────────────────────────────────────────────────
alter table public.atividades add column if not exists tipos text[] not null default '{}';
update public.atividades set tipos = array[tipo] where tipo is not null and tipos = '{}';
alter table public.atividades drop column if exists tipo;

-- ── 2. publicar (assinatura muda: p_tipo text -> p_tipos text[]) ─────
drop function if exists public.dr_atividade_publicar(text, text, text, boolean, text[], timestamptz);

create or replace function public.dr_atividade_publicar(
  p_titulo text,
  p_texto text,
  p_tipos text[] default '{}',
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
  v_tipo    text;
  v_tipos   text[] := coalesce(p_tipos, '{}');
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

  foreach v_tipo in array v_tipos loop
    if not exists (select 1 from public.atividade_tipos where tipo = v_tipo and ativo = true) then
      return jsonb_build_object('ok', false, 'erro', 'Tipo de atividade desconhecido ou por ativar: ' || v_tipo);
    end if;
  end loop;

  if not p_alvo_todas and coalesce(array_length(p_alvo_cedulas, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Escolha pelo menos uma empresa, ou marque "todas".');
  end if;

  insert into public.atividades(id, titulo, texto, tipos, alvo_todas, alvo_cedulas, prazo, criada_por)
  values (v_id, v_titulo, v_texto, v_tipos, p_alvo_todas, coalesce(p_alvo_cedulas, '{}'), p_prazo,
          public.fn_minha_cedula());

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

revoke execute on function public.dr_atividade_publicar(text, text, text[], boolean, text[], timestamptz)
  from public, anon;
grant execute on function public.dr_atividade_publicar(text, text, text[], boolean, text[], timestamptz)
  to authenticated;

-- ── 3. verificar (loop sobre tipos[], provas em array uniforme) ──────
create or replace function public.dr_minhas_atividades()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa text := public.fn_minha_empresa_cedula();
  v_linhas jsonb := '[]'::jsonb;
  r record;
  v_tipo text;
  v_prova_tipo jsonb;
  v_provas jsonb;
  v_todas_cumpridas boolean;
  v_decl record;
  v_cumprida boolean;
  v_tem_tipos boolean;
begin
  if v_empresa is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem empresa associada.');
  end if;

  for r in
    select a.id, a.titulo, a.texto, a.tipos, a.prazo, a.criada_em
      from public.atividades a
     where a.alvo_todas or v_empresa = any(a.alvo_cedulas)
     order by a.prazo asc
  loop
    v_provas := '[]'::jsonb;
    v_tem_tipos := coalesce(array_length(r.tipos, 1), 0) > 0;
    v_todas_cumpridas := true;

    if v_tem_tipos then
      foreach v_tipo in array r.tipos loop
        v_prova_tipo := null;

        if v_tipo = 'publicar_vaga' then
          select jsonb_build_object('titulo', v.titulo, 'criada_em', v.criada_em)
            into v_prova_tipo
            from public.vagas v
           where v.empresa_cedula = v_empresa and v.estado = 'publicada'
             and v.criada_em >= r.criada_em
           order by v.criada_em desc limit 1;

        elsif v_tipo in ('entregar_guia_iva', 'entregar_modelo22', 'admitir_trabalhador',
                          'cessar_trabalhador', 'entregar_tsu', 'registar_empresa',
                          'reconhecer_assinatura', 'alterar_registo') then
          select jsonb_build_object('protocolo', s.protocolo, 'criada_em', s.criada_em)
            into v_prova_tipo
            from public.submissoes s
           where s.empresa_cedula = v_empresa and s.estado = 'aprovado'
             and s.tipo = case v_tipo
                   when 'entregar_guia_iva' then 'guia_iva'
                   when 'entregar_modelo22' then 'modelo22'
                   when 'admitir_trabalhador' then 'registo_trabalhador'
                   when 'cessar_trabalhador' then 'cessacao_trabalhador'
                   when 'entregar_tsu' then 'tsu'
                   when 'registar_empresa' then 'registo_empresa'
                   when 'reconhecer_assinatura' then 'reconhecimento'
                   when 'alterar_registo' then 'alteracao_registo'
                 end
             and s.criada_em >= r.criada_em
           order by s.criada_em desc limit 1;

        elsif v_tipo = 'emitir_certidao' then
          select jsonb_build_object('protocolo', s.protocolo, 'prazo', s.prazo)
            into v_prova_tipo
            from public.submissoes s
           where s.empresa_cedula = v_empresa and s.tipo = 'certidao_permanente'
             and s.estado = 'aprovado' and s.criada_em >= r.criada_em
           order by s.criada_em desc limit 1;

        elsif v_tipo = 'pagar_salario' then
          select jsonb_build_object('valor', t.valor, 'criada_em', t.criada_em)
            into v_prova_tipo
            from public.transacoes t
            join public.contas c on c.iban = t.origem_iban
           where c.cedula = v_empresa and t.categoria = 'salario' and t.estado = 'concluida'
             and t.criada_em >= r.criada_em
           order by t.criada_em desc limit 1;

        elsif v_tipo = 'assinar_documento' then
          select jsonb_build_object('criada_em', d.criado_em)
            into v_prova_tipo
            from public.documentos d
            join public.documento_slots ds on ds.documento_id = d.id
           where ds.empresa_esperada = v_empresa and d.estado = 'completo'
             and d.criado_em >= r.criada_em
           order by d.criado_em desc limit 1;
        end if;

        if v_prova_tipo is null then v_todas_cumpridas := false; end if;

        v_provas := v_provas || jsonb_build_array(jsonb_build_object(
          'tipo', v_tipo, 'cumprida', v_prova_tipo is not null, 'prova', v_prova_tipo));
      end loop;

      v_cumprida := v_todas_cumpridas;
    else
      v_cumprida := false;
      select ad.anexo_caminho, ad.declarada_em into v_decl
        from public.atividade_declaracoes ad
       where ad.atividade_id = r.id and ad.empresa_cedula = v_empresa;
      if found then
        v_cumprida := true;
        v_provas := jsonb_build_array(jsonb_build_object(
          'tipo', null, 'cumprida', true,
          'prova', jsonb_build_object(
            'anexo_caminho', v_decl.anexo_caminho, 'declarada_em', v_decl.declarada_em)));
      else
        v_provas := jsonb_build_array(jsonb_build_object(
          'tipo', null, 'cumprida', false, 'prova', null));
      end if;
    end if;

    v_linhas := v_linhas || jsonb_build_object(
      'id', r.id, 'titulo', r.titulo, 'texto', r.texto, 'tipos', to_jsonb(r.tipos),
      'prazo', r.prazo, 'cumprida', v_cumprida, 'provas', v_provas,
      'atrasada', (r.prazo < now() and not v_cumprida)
    );
  end loop;

  return jsonb_build_object('ok', true, 'dados', v_linhas);
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível listar as atividades.');
end;
$$;

revoke execute on function public.dr_minhas_atividades() from public, anon;
grant execute on function public.dr_minhas_atividades() to authenticated;

-- ── 4. declarar (a condição muda de "tipo is not null" para tipos vazio) ─
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

  select id, tipos, alvo_todas, alvo_cedulas into v_atividade
    from public.atividades where id = p_atividade_id;
  if v_atividade.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Atividade não encontrada.');
  end if;
  if coalesce(array_length(v_atividade.tipos, 1), 0) > 0 then
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

-- ── 5. montra pública — também referenciava a coluna tipo, já removida ──
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
           'id', a.id, 'titulo', a.titulo, 'texto', a.texto, 'tipos', to_jsonb(a.tipos),
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
