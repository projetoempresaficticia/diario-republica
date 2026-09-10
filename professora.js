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

async function carregarTipos() {
  const select = document.getElementById('tipo');
  const { data, error } = await sb
    .from('atividade_tipos').select('tipo, descricao, app_alvo')
    .eq('ativo', true).order('descricao');
  if (error || !data) return;
  data.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.tipo;
    opt.textContent = t.descricao + ' (' + t.app_alvo + ')';
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const ajuda = document.getElementById('ajuda-tipo');
    ajuda.textContent = select.value
      ? 'A empresa vê sozinha se já cumpriu — sem precisar de anexar nada.'
      : 'A empresa marca "concluída" e anexa um PDF como prova.';
  });
}

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

// ── alvo: todas ou uma lista de cédulas ──────────────────────────────
const campoCedulas = document.getElementById('cedulas');
document.querySelectorAll('input[name="alvo"]').forEach((r) => {
  r.addEventListener('change', () => {
    campoCedulas.disabled = document.querySelector('input[name="alvo"]:checked').value !== 'lista';
    if (!campoCedulas.disabled) campoCedulas.focus();
  });
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
  const alvoTodas = document.querySelector('input[name="alvo"]:checked').value === 'todas';
  const cedulas = alvoTodas ? [] : campoCedulas.value.split(',')
    .map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!alvoTodas && cedulas.length === 0) {
    mostrarMsg(msg, 'Indique pelo menos uma empresa, ou escolha "Todas as empresas".', 'erro');
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
    p_tipo: document.getElementById('tipo').value || null,
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
  campoCedulas.disabled = true;
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
