-- =============================================================================
-- 002_catalogo_atividades.sql — os 16 tipos verificáveis
--
-- Levantados ficheiro a ficheiro nas SQLs reais de cada app (AT, Segurança
-- Social, Cartório, Prepacoin, Talentos, Subsight) — não inventados. Ver
-- docs/TAREFAS-DIARIO-REPUBLICA.md no repositório de documentação para a
-- tabela completa com a justificação de cada um.
--
-- Os quatro `pagar_*` do pp-utilities entram já na tabela, com
-- `ativo = false`: aquele app ainda não tem nenhuma tabela (só um
-- README), por isso não há nada para verificar contra. Ligar depois é só
-- trocar a flag e escrever o ramo do `case` em dr_minhas_atividades —
-- nada mais no Diário muda.
--
-- Aplicada ao Supabase do projeto (moxxbehwylcjaqjacmyh).
-- =============================================================================

insert into public.atividade_tipos (tipo, app_alvo, descricao, link_sugerido, campos_mostrados, ativo)
values
  ('publicar_vaga', 'talentos', 'Publicar uma vaga de emprego',
   'https://projetoempresaficticia.github.io/talentos/empresa.html',
   array['titulo', 'criada_em'], true),

  ('entregar_guia_iva', 'AT', 'Entregar a guia de IVA do período',
   'https://projetoempresaficticia.github.io/portal-financas/declaracoes.html',
   array['protocolo', 'criada_em'], true),

  ('entregar_modelo22', 'AT', 'Entregar o Modelo 22 (IRC)',
   'https://projetoempresaficticia.github.io/portal-financas/declaracoes.html',
   array['protocolo', 'criada_em'], true),

  ('admitir_trabalhador', 'seg_social', 'Registar a admissão de um trabalhador',
   'https://projetoempresaficticia.github.io/seguranca-social/carreira.html',
   array['protocolo', 'criada_em'], true),

  ('cessar_trabalhador', 'seg_social', 'Registar a cessação de um trabalhador',
   'https://projetoempresaficticia.github.io/seguranca-social/carreira.html',
   array['protocolo', 'criada_em'], true),

  ('entregar_tsu', 'seg_social', 'Entregar a declaração de remunerações (TSU)',
   'https://projetoempresaficticia.github.io/seguranca-social/declaracoes.html',
   array['protocolo', 'criada_em'], true),

  ('registar_empresa', 'cartorio', 'Registar a empresa no Cartório',
   'https://projetoempresaficticia.github.io/cartorio-notarial/pedir.html',
   array['protocolo', 'criada_em'], true),

  ('emitir_certidao', 'cartorio', 'Emitir a certidão permanente',
   'https://projetoempresaficticia.github.io/cartorio-notarial/pedir.html',
   array['protocolo', 'prazo'], true),

  ('reconhecer_assinatura', 'cartorio', 'Pedir reconhecimento de assinatura',
   'https://projetoempresaficticia.github.io/cartorio-notarial/pedir.html',
   array['protocolo', 'criada_em'], true),

  ('alterar_registo', 'cartorio', 'Registar uma alteração da empresa',
   'https://projetoempresaficticia.github.io/cartorio-notarial/pedir.html',
   array['protocolo', 'criada_em'], true),

  ('pagar_salario', 'prepacoin', 'Pagar o salário de um funcionário',
   'https://projetoempresaficticia.github.io/prepacoin/transferir.html',
   array['valor', 'criada_em'], true),

  ('assinar_documento', 'subsight', 'Assinar um documento',
   'https://projetoempresaficticia.github.io/subsight/index.html',
   array['criada_em'], true),

  ('pagar_agua', 'pp-utilities', 'Pagar a fatura de água',
   null, array['valor', 'pago_em'], false),
  ('pagar_energia', 'pp-utilities', 'Pagar a fatura de energia',
   null, array['valor', 'pago_em'], false),
  ('pagar_internet', 'pp-utilities', 'Pagar a fatura de internet',
   null, array['valor', 'pago_em'], false),
  ('pagar_aluguel', 'pp-utilities', 'Pagar a fatura de aluguer',
   null, array['valor', 'pago_em'], false)
on conflict (tipo) do update
  set app_alvo = excluded.app_alvo,
      descricao = excluded.descricao,
      link_sugerido = excluded.link_sugerido,
      campos_mostrados = excluded.campos_mostrados,
      ativo = excluded.ativo;
