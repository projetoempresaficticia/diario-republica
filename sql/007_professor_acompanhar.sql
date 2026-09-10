-- 007_professor_acompanhar.sql — a professora vê, por atividade publicada,
-- que empresas já cumpriram e quais faltam, sem ter de entrar em cada
-- empresa uma a uma.
--
-- A lógica de verificação por tipo (o `case` que já existia dentro de
-- dr_minhas_atividades) é extraída para uma função só, parametrizada por
-- empresa — dr_minhas_atividades passa a chamá-la para a empresa da sessão,
-- e a nova dr_professor_acompanhar chama-a para cada empresa visada por
-- cada atividade. Nada de duplicar o `case` de doze ramos duas vezes.

-- ── 1. o verificador, agora reutilizável por qualquer empresa ──────────
-- SEM grant a authenticated/anon: só é chamável a partir de outra função
-- security definer do mesmo dono (dr_minhas_atividades, dr_professor_
-- acompanhar) — nunca diretamente, senão qualquer empresa autenticada
-- podia perguntar pelo estado de qualquer outra.
create or replace function public.fn_verificar_atividade_empresa(p_atividade_id uuid, p_empresa text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  r record;
  v_tipo text;
  v_prova_tipo jsonb;
  v_provas jsonb := '[]'::jsonb;
  v_todas_cumpridas boolean := true;
  v_decl record;
  v_cumprida boolean;
  v_tem_tipos boolean;
begin
  select a.id, a.tipos, a.criada_em into r
    from public.atividades a where a.id = p_atividade_id;
  if not found then
    return jsonb_build_object('cumprida', false, 'provas', '[]'::jsonb);
  end if;

  v_tem_tipos := coalesce(array_length(r.tipos, 1), 0) > 0;

  if v_tem_tipos then
    foreach v_tipo in array r.tipos loop
      v_prova_tipo := null;

      if v_tipo = 'publicar_vaga' then
        select jsonb_build_object('titulo', v.titulo, 'criada_em', v.criada_em)
          into v_prova_tipo
          from public.vagas v
         where v.empresa_cedula = p_empresa and v.estado = 'publicada'
           and v.criada_em >= r.criada_em
         order by v.criada_em desc limit 1;

      elsif v_tipo in ('entregar_guia_iva', 'entregar_modelo22', 'admitir_trabalhador',
                        'cessar_trabalhador', 'entregar_tsu', 'registar_empresa',
                        'reconhecer_assinatura', 'alterar_registo') then
        select jsonb_build_object('protocolo', s.protocolo, 'criada_em', s.criada_em)
          into v_prova_tipo
          from public.submissoes s
         where s.empresa_cedula = p_empresa and s.estado = 'aprovado'
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
         where s.empresa_cedula = p_empresa and s.tipo = 'certidao_permanente'
           and s.estado = 'aprovado' and s.criada_em >= r.criada_em
         order by s.criada_em desc limit 1;

      elsif v_tipo = 'pagar_salario' then
        select jsonb_build_object('valor', t.valor, 'criada_em', t.criada_em)
          into v_prova_tipo
          from public.transacoes t
          join public.contas c on c.iban = t.origem_iban
         where c.cedula = p_empresa and t.categoria = 'salario' and t.estado = 'concluida'
           and t.criada_em >= r.criada_em
         order by t.criada_em desc limit 1;

      elsif v_tipo = 'assinar_documento' then
        select jsonb_build_object('criada_em', d.criado_em)
          into v_prova_tipo
          from public.documentos d
          join public.documento_slots ds on ds.documento_id = d.id
         where ds.empresa_esperada = p_empresa and d.estado = 'completo'
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
     where ad.atividade_id = r.id and ad.empresa_cedula = p_empresa;
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

  return jsonb_build_object('cumprida', v_cumprida, 'provas', v_provas);
end;
$function$;

revoke all on function public.fn_verificar_atividade_empresa(uuid, text) from public, anon, authenticated;

-- ── 2. dr_minhas_atividades passa a chamar o verificador partilhado ────
create or replace function public.dr_minhas_atividades()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_empresa text := public.fn_minha_empresa_cedula();
  v_linhas jsonb := '[]'::jsonb;
  r record;
  v_estado jsonb;
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
    v_estado := public.fn_verificar_atividade_empresa(r.id, v_empresa);

    v_linhas := v_linhas || jsonb_build_object(
      'id', r.id, 'titulo', r.titulo, 'texto', r.texto, 'tipos', to_jsonb(r.tipos),
      'prazo', r.prazo, 'cumprida', (v_estado->>'cumprida')::boolean,
      'provas', v_estado->'provas',
      'atrasada', (r.prazo < now() and not (v_estado->>'cumprida')::boolean)
    );
  end loop;

  return jsonb_build_object('ok', true, 'dados', v_linhas);
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível listar as atividades.');
end;
$function$;

-- ── 3. dr_professor_acompanhar — uma linha por atividade, com o estado
--       de cada empresa visada ─────────────────────────────────────────
create or replace function public.dr_professor_acompanhar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_linhas jsonb := '[]'::jsonb;
  r record;
  v_empresas jsonb;
begin
  if not public.fn_e_professor() then
    return jsonb_build_object('ok', false, 'erro', 'Sem permissão.');
  end if;

  for r in
    select a.id, a.titulo, a.tipos, a.prazo, a.alvo_todas, a.alvo_cedulas, a.criada_em
      from public.atividades a
     order by a.criada_em desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'cedula', e.cedula, 'nome', e.nome,
             'cumprida', (v.estado->>'cumprida')::boolean,
             'provas', v.estado->'provas'
           ) order by e.nome), '[]'::jsonb)
      into v_empresas
      from public.empresas e
      cross join lateral (select public.fn_verificar_atividade_empresa(r.id, e.cedula) as estado) v
     where r.alvo_todas or e.cedula = any(r.alvo_cedulas);

    v_linhas := v_linhas || jsonb_build_object(
      'id', r.id, 'titulo', r.titulo, 'tipos', to_jsonb(r.tipos), 'prazo', r.prazo,
      'criada_em', r.criada_em, 'empresas', v_empresas
    );
  end loop;

  return jsonb_build_object('ok', true, 'dados', v_linhas);
exception when others then
  return jsonb_build_object('ok', false, 'erro', 'Não foi possível carregar o acompanhamento.');
end;
$function$;

revoke all on function public.dr_professor_acompanhar() from public, anon;
grant execute on function public.dr_professor_acompanhar() to authenticated;
