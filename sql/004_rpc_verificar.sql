-- =============================================================================
-- 004_rpc_verificar.sql — dr_minhas_atividades, com os doze verificadores
--
-- Não existe verificador genérico: cada tipo sabe a sua própria tabela e
-- os seus próprios campos — por isso o catálogo é fechado (001/002), não
-- texto livre. `atrasada` é sempre calculada (prazo < agora e ainda não
-- cumprida) — não há estado "encerrada"; a UI pinta a vermelho sozinha
-- com este campo, reaproveitando o selo "Urgente" já desenhado na
-- biblioteca.
--
-- Os quatro tipos do pp-utilities (pagar_agua/energia/internet/aluguel)
-- não têm ramo no `case` de propósito: ficam `ativo = false` no
-- catálogo, por isso a professora não consegue publicar uma atividade
-- com eles ainda — não há nada a verificar sem o app existir.
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh).
-- =============================================================================

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
  v_cumprida boolean;
  v_prova jsonb;
  v_decl jsonb;
begin
  if v_empresa is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem empresa associada.');
  end if;

  for r in
    select a.id, a.titulo, a.texto, a.tipo, a.prazo, a.criada_em
      from public.atividades a
     where a.alvo_todas or v_empresa = any(a.alvo_cedulas)
     order by a.prazo asc
  loop
    v_cumprida := false;
    v_prova := null;

    if r.tipo = 'publicar_vaga' then
      select jsonb_build_object('titulo', v.titulo, 'criada_em', v.criada_em)
        into v_prova
        from public.vagas v
       where v.empresa_cedula = v_empresa and v.estado = 'publicada'
         and v.criada_em >= r.criada_em
       order by v.criada_em desc limit 1;

    elsif r.tipo in ('entregar_guia_iva', 'entregar_modelo22', 'admitir_trabalhador',
                      'cessar_trabalhador', 'entregar_tsu', 'registar_empresa',
                      'reconhecer_assinatura', 'alterar_registo') then
      select jsonb_build_object('protocolo', s.protocolo, 'criada_em', s.criada_em)
        into v_prova
        from public.submissoes s
       where s.empresa_cedula = v_empresa and s.estado = 'aprovado'
         and s.tipo = case r.tipo
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

    elsif r.tipo = 'emitir_certidao' then
      select jsonb_build_object('protocolo', s.protocolo, 'prazo', s.prazo)
        into v_prova
        from public.submissoes s
       where s.empresa_cedula = v_empresa and s.tipo = 'certidao_permanente'
         and s.estado = 'aprovado' and s.criada_em >= r.criada_em
       order by s.criada_em desc limit 1;

    elsif r.tipo = 'pagar_salario' then
      select jsonb_build_object('valor', t.valor, 'criada_em', t.criada_em)
        into v_prova
        from public.transacoes t
        join public.contas c on c.iban = t.origem_iban
       where c.cedula = v_empresa and t.categoria = 'salario' and t.estado = 'concluida'
         and t.criada_em >= r.criada_em
       order by t.criada_em desc limit 1;

    elsif r.tipo = 'assinar_documento' then
      select jsonb_build_object('criada_em', d.criado_em)
        into v_prova
        from public.documentos d
        join public.documento_slots ds on ds.documento_id = d.id
       where ds.empresa_esperada = v_empresa and d.estado = 'completo'
         and d.criado_em >= r.criada_em
       order by d.criado_em desc limit 1;
    end if;

    v_cumprida := v_prova is not null;

    if not v_cumprida and r.tipo is null then
      select jsonb_build_object('anexo_caminho', ad.anexo_caminho, 'declarada_em', ad.declarada_em)
        into v_decl
        from public.atividade_declaracoes ad
       where ad.atividade_id = r.id and ad.empresa_cedula = v_empresa;
      if found then
        v_cumprida := true;
        v_prova := v_decl;
      end if;
    end if;

    v_linhas := v_linhas || jsonb_build_object(
      'id', r.id, 'titulo', r.titulo, 'texto', r.texto, 'tipo', r.tipo,
      'prazo', r.prazo, 'cumprida', v_cumprida, 'prova', v_prova,
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
