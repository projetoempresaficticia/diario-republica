-- 008_prova_com_documento.sql — a prova de cada tipo passa a trazer o
-- número de protocolo E uma referência ao documento real (quando existe),
-- para a professora poder abrir e ver o que foi entregue, não só ler
-- "cumprida" sem mais nenhum detalhe.
--
-- `arquivo_caminho` é um caminho dentro do bucket Storage 'documentos'
-- (para provas com assinatura_doc_id) — o frontend gera um signed URL a
-- partir dele. A policy "quem ve o documento baixa o arquivo" já cobre a
-- professora (fn_documento_visivel devolve true para fn_e_professor()) e
-- a empresa dona/parte do slot, por isso não é preciso policy nova.

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
        select jsonb_build_object(
                 'protocolo', s.protocolo, 'criada_em', s.criada_em,
                 'documento_id', s.assinatura_doc_id,
                 'arquivo_caminho', d.arquivo_url, 'arquivo_nome', d.nome_arquivo)
          into v_prova_tipo
          from public.submissoes s
          left join public.documentos d on d.id = s.assinatura_doc_id
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
        select jsonb_build_object(
                 'protocolo', s.protocolo, 'prazo', s.prazo,
                 'documento_id', s.assinatura_doc_id,
                 'arquivo_caminho', d.arquivo_url, 'arquivo_nome', d.nome_arquivo)
          into v_prova_tipo
          from public.submissoes s
          left join public.documentos d on d.id = s.assinatura_doc_id
         where s.empresa_cedula = p_empresa and s.tipo = 'certidao_permanente'
           and s.estado = 'aprovado' and s.criada_em >= r.criada_em
         order by s.criada_em desc limit 1;

      elsif v_tipo = 'pagar_salario' then
        select jsonb_build_object('valor', t.valor, 'criada_em', t.criada_em, 'codigo_auth', t.codigo_auth)
          into v_prova_tipo
          from public.transacoes t
          join public.contas c on c.iban = t.origem_iban
         where c.cedula = p_empresa and t.categoria = 'salario' and t.estado = 'concluida'
           and t.criada_em >= r.criada_em
         order by t.criada_em desc limit 1;

      elsif v_tipo = 'assinar_documento' then
        select jsonb_build_object(
                 'criada_em', d.criado_em, 'documento_id', d.id,
                 'arquivo_caminho', d.arquivo_url, 'arquivo_nome', d.nome_arquivo)
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
