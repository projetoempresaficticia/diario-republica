// Diário da República — a professora publica uma atividade obrigatória.
// Página privada de ponta a ponta, só para quem tem `papel = 'professor'`.

const elAVerificar = document.getElementById('a-verificar');
const elEntrada = document.getElementById('entrada');
const elPainel = document.getElementById('painel');

function mostrarPainel() {
  elAVerificar.hidden = true;
  elEntrada.hidden = true;
  elPainel.hidden = false;
}

function mostrarEntrada() {
  elAVerificar.hidden = true;
  elPainel.hidden = true;
  elEntrada.hidden = false;
}

// ── tipos de atividade: tags multi-selecionáveis ─────────────────────
// Nada de <select> — cada tipo ativo é uma tag; tocar alterna. Zero
// tags escolhidas = autodeclaração; uma ou mais = todas têm de estar
// cumpridas (E lógico, decisão do Germano).
const tiposEscolhidos = new Set();

function atualizarTextoEscolhidos() {
  const el = document.getElementById('tipos-escolhidos');
  el.textContent = tiposEscolhidos.size === 0
    ? 'Nenhuma tag escolhida — autodeclaração com anexo.'
    : tiposEscolhidos.size + ' tipo(s) escolhido(s) — todos têm de ser cumpridos.';
}

async function carregarTipos() {
  const lista = document.getElementById('lista-tipos');
  const { data, error } = await sb
    .from('atividade_tipos').select('tipo, descricao, app_alvo')
    .eq('ativo', true).order('descricao');
  if (error || !data) {
    lista.innerHTML = '<p class="dr-vazio">Não foi possível carregar os tipos.</p>';
    return;
  }
  lista.innerHTML = data.map((t) => `
    <button type="button" class="dr-tag" data-tipo="${esc(t.tipo)}" aria-pressed="false">
      ${esc(t.descricao)} <span class="app">${esc(t.app_alvo)}</span>
    </button>`).join('');
  lista.querySelectorAll('.dr-tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      const tipo = tag.dataset.tipo;
      const selecionada = tag.getAttribute('aria-pressed') === 'true';
      tag.setAttribute('aria-pressed', String(!selecionada));
      if (selecionada) tiposEscolhidos.delete(tipo); else tiposEscolhidos.add(tipo);
      atualizarTextoEscolhidos();
    });
  });
  atualizarTextoEscolhidos();
}

// ── destinatário: todas as empresas, ou uma lista escolhida ──────────
const empresasEscolhidas = new Set();
const btnAlvoTodas = document.getElementById('alvo-todas');
const btnAlvoLista = document.getElementById('alvo-lista');
const blocoListaEmpresasEl = document.getElementById('bloco-lista-empresas');
const listaEmpresasEl = document.getElementById('lista-empresas');
const buscaEmpresasEl = document.getElementById('busca-empresas');
let empresasCarregadas = false;

async function carregarEmpresas() {
  if (empresasCarregadas) return;
  empresasCarregadas = true;
  const { data, error } = await sb.from('empresas').select('cedula, nome').order('nome');
  if (error || !data) {
    listaEmpresasEl.innerHTML = '<p class="dr-vazio">Não foi possível carregar as empresas.</p>';
    return;
  }
  listaEmpresasEl.innerHTML = data.map((e) => `
    <label class="dr-empresa-linha" data-cedula="${esc(e.cedula)}"
            data-busca="${esc((e.nome + ' ' + e.cedula).toLowerCase())}">
      <input type="checkbox" value="${esc(e.cedula)}" />
      <span>
        <span class="nome" style="display:block">${esc(e.nome)}</span>
        <span class="cedula mono">${esc(e.cedula)}</span>
      </span>
    </label>`).join('');
  listaEmpresasEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const linha = cb.closest('.dr-empresa-linha');
      if (cb.checked) { empresasEscolhidas.add(cb.value); linha.classList.add('selecionada'); }
      else { empresasEscolhidas.delete(cb.value); linha.classList.remove('selecionada'); }
    });
  });
}

// Filtro em cima dos dados já carregados — sem tamanho a sério ainda
// (6 empresas de teste), mas o catálogo real do ecossistema chega às
// ~200, e uma checklist sem busca fica lenta de percorrer à mão.
buscaEmpresasEl.addEventListener('input', () => {
  const termo = buscaEmpresasEl.value.trim().toLowerCase();
  listaEmpresasEl.querySelectorAll('.dr-empresa-linha').forEach((linha) => {
    linha.hidden = termo !== '' && !linha.dataset.busca.includes(termo);
  });
});

btnAlvoTodas.addEventListener('click', () => {
  btnAlvoTodas.setAttribute('aria-pressed', 'true');
  btnAlvoLista.setAttribute('aria-pressed', 'false');
  blocoListaEmpresasEl.hidden = true;
});
btnAlvoLista.addEventListener('click', async () => {
  btnAlvoTodas.setAttribute('aria-pressed', 'false');
  btnAlvoLista.setAttribute('aria-pressed', 'true');
  blocoListaEmpresasEl.hidden = false;
  await carregarEmpresas();
});

// ── o editor de texto formatado ──────────────────────────────────────
const editorTexto = document.getElementById('texto');
const linhaLigacao = document.getElementById('linha-ligacao');
const campoUrlLigacao = document.getElementById('url-ligacao');

try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* browser antigo */ }

function marcarVazioTexto() {
  editorTexto.dataset.vazio = String(editorTexto.textContent.trim() === '');
}

function actualizarBarraFormatacao() {
  document.querySelectorAll('.dr-ferramentas button[data-cmd]').forEach((b) => {
    const c = b.dataset.cmd;
    if (c.includes(':') || !b.hasAttribute('aria-pressed')) return;
    try { b.setAttribute('aria-pressed', String(document.queryCommandState(c))); }
    catch (e) { /* comando que este browser não conhece */ }
  });
}

document.querySelectorAll('.dr-ferramentas button, .dr-ligacao button')
  .forEach((b) => b.addEventListener('mousedown', (ev) => ev.preventDefault()));

document.querySelectorAll('.dr-ferramentas button[data-cmd]').forEach((b) => {
  b.addEventListener('click', () => {
    editorTexto.focus();
    const c = b.dataset.cmd;
    if (c.startsWith('formatBlock:')) document.execCommand('formatBlock', false, c.split(':')[1]);
    else document.execCommand(c, false, null);
    actualizarBarraFormatacao();
    marcarVazioTexto();
  });
});

editorTexto.addEventListener('input', () => { marcarVazioTexto(); actualizarBarraFormatacao(); });
document.addEventListener('selectionchange', () => {
  if (document.activeElement === editorTexto) actualizarBarraFormatacao();
});

editorTexto.addEventListener('paste', (ev) => {
  ev.preventDefault();
  const dt = ev.clipboardData;
  if (!dt) return;
  const html = dt.getData('text/html');
  const limpo = html ? limparHtml(html) : esc(dt.getData('text/plain')).replace(/\n/g, '<br>');
  document.execCommand('insertHTML', false, limpo);
  marcarVazioTexto();
});

let intervaloGuardado = null;
document.getElementById('btn-ligacao').addEventListener('click', () => {
  const sel = window.getSelection();
  intervaloGuardado = (sel && sel.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;
  linhaLigacao.hidden = false;
  campoUrlLigacao.value = '';
  campoUrlLigacao.focus();
});
document.getElementById('btn-cancelar-ligacao').addEventListener('click', () => {
  linhaLigacao.hidden = true;
  editorTexto.focus();
});
document.getElementById('btn-aplicar-ligacao').addEventListener('click', () => {
  let url = campoUrlLigacao.value.trim();
  if (!url) return;
  if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;

  editorTexto.focus();
  if (intervaloGuardado) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(intervaloGuardado);
  }
  if (window.getSelection().isCollapsed) {
    document.execCommand('insertHTML', false,
      '<a href="' + esc(url) + '">' + esc(url) + '</a>&nbsp;');
  } else {
    document.execCommand('createLink', false, url);
  }
  linhaLigacao.hidden = true;
  marcarVazioTexto();
});
campoUrlLigacao.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); document.getElementById('btn-aplicar-ligacao').click(); }
});

// ── publicar ──────────────────────────────────────────────────────────
document.getElementById('form-atividade').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const msg = document.getElementById('msg-atividade');
  const btn = form.querySelector('button[type="submit"]');

  if (editorTexto.textContent.trim() === '') {
    mostrarMsg(msg, 'Escreva o texto da atividade.', 'erro');
    return;
  }
  const alvoTodas = btnAlvoTodas.getAttribute('aria-pressed') === 'true';
  const cedulas = alvoTodas ? [] : Array.from(empresasEscolhidas);
  if (!alvoTodas && cedulas.length === 0) {
    mostrarMsg(msg, 'Escolha pelo menos uma empresa, ou selecione "Todas as empresas".', 'erro');
    return;
  }
  const prazoValor = document.getElementById('prazo').value;
  if (!prazoValor) {
    mostrarMsg(msg, 'Escolha um prazo.', 'erro');
    return;
  }

  btn.disabled = true;
  mostrarMsg(msg, 'A publicar…');

  const r = await api('dr_atividade_publicar', {
    p_titulo: document.getElementById('titulo').value,
    p_texto: limparHtml(editorTexto.innerHTML),
    p_tipos: Array.from(tiposEscolhidos),
    p_alvo_todas: alvoTodas,
    p_alvo_cedulas: cedulas,
    p_prazo: new Date(prazoValor).toISOString(),
  });
  btn.disabled = false;
  if (!r.ok) { mostrarMsg(msg, r.erro, 'erro'); return; }

  mostrarMsg(msg, 'Atividade publicada — ' + r.dados.avisadas + ' pessoa(s) avisada(s) por Correio.', 'ok');
  form.reset();
  editorTexto.innerHTML = '';
  marcarVazioTexto();
  tiposEscolhidos.clear();
  document.querySelectorAll('.dr-tag[aria-pressed="true"]').forEach((t) => t.setAttribute('aria-pressed', 'false'));
  atualizarTextoEscolhidos();
  empresasEscolhidas.clear();
  document.querySelectorAll('#lista-empresas input:checked').forEach((cb) => { cb.checked = false; });
  document.querySelectorAll('.dr-empresa-linha.selecionada').forEach((l) => l.classList.remove('selecionada'));
  buscaEmpresasEl.value = '';
  document.querySelectorAll('.dr-empresa-linha[hidden]').forEach((l) => { l.hidden = false; });
  btnAlvoTodas.click();
});

// ── entrar ────────────────────────────────────────────────────────────
ligarVerSenha();
ligarFormularioLogin('form-login', async () => {
  const ctx = await quemSou();
  if (!ctx || !ctx.pessoa || ctx.pessoa.papel !== 'professor') {
    mostrarMsg(document.querySelector('#form-login .dr-msg'),
      'Esta conta não tem acesso à área da professora.', 'erro');
    await sb.auth.signOut();
    return;
  }
  mostrarPainel();
  await montarTopo('professora.html', ctx);
  await carregarTipos();
});

(async function arrancar() {
  const ctx = await quemSou();
  if (!ctx || !ctx.pessoa || ctx.pessoa.papel !== 'professor') { mostrarEntrada(); return; }
  mostrarPainel();
  await montarTopo('professora.html', ctx);
  await carregarTipos();
})();
