// Diário da República — as atividades da empresa: cumpridas sozinhas
// (verificação automática) ou por declarar com anexo.

const elAVerificar = document.getElementById('a-verificar');
const elEntrada = document.getElementById('entrada');
const elPainel = document.getElementById('painel');
const elLista = document.getElementById('lista');

let tiposPorNome = {};
let atividadeParaDeclarar = null;

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

// Uma entrada de `provas`: {tipo, cumprida, prova}. `tipo === null` é a
// autodeclaração; qualquer outro valor é um tipo do catálogo (verifica-se
// sozinho). Cada uma vira uma mini-linha dentro do cartão.
function linhaProva(p, atividadeId) {
  if (p.tipo === null) {
    if (p.cumprida) {
      return `<div class="dr-justificativa" style="margin-top:var(--dr-e3)">${esc(textoDaProva(p.prova))}</div>`;
    }
    return `<button type="button" class="dr-botao dr-botao-pequeno" style="margin-top:var(--dr-e3)"
              data-declarar="${esc(atividadeId)}">Declarar cumprimento</button>`;
  }

  const info = tiposPorNome[p.tipo];
  const descricao = info ? info.descricao : p.tipo;
  if (p.cumprida) {
    return `
      <div class="dr-fila" style="margin-top:var(--dr-e3);justify-content:space-between">
        <span class="dr-selo dr-selo-concluido"><span class="ponto"></span>${esc(descricao)}</span>
        <span class="dr-suave" style="font-size:12.5px">${esc(textoDaProva(p.prova))}</span>
      </div>`;
  }
  return `
    <div class="dr-fila" style="margin-top:var(--dr-e3);justify-content:space-between">
      <span class="dr-selo dr-selo-em-curso"><span class="ponto"></span>${esc(descricao)}</span>
      ${info && info.link_sugerido
        ? `<a class="dr-botao dr-botao-linha dr-botao-pequeno"
             href="${esc(info.link_sugerido)}" target="_blank" rel="noopener">Ir para ${esc(info.app_alvo)}</a>`
        : ''}
    </div>`;
}

function linhaAtividade(a) {
  const provas = a.provas || [];
  return `
    <article class="dr-cartao" style="margin-bottom:var(--dr-e4)">
      <div class="cabeca">
        <h3>${esc(a.titulo)}</h3>
        ${seloAtividade(a)}
      </div>
      <div class="descricao dr-corpo">${limparHtml(a.texto)}</div>
      <p class="dr-suave" style="font-size:13px;margin-top:var(--dr-e2)">
        Prazo: ${esc(formatarData(a.prazo))}
      </p>
      ${provas.map((p) => linhaProva(p, a.id)).join('')}
    </article>`;
}

async function carregarTiposCatalogo() {
  const { data } = await sb.from('atividade_tipos').select('tipo, descricao, link_sugerido, app_alvo');
  (data || []).forEach((t) => { tiposPorNome[t.tipo] = t; });
}

async function carregar() {
  const r = await api('dr_minhas_atividades');
  if (!r.ok) {
    elLista.innerHTML = `<p class="dr-vazio">${esc(r.erro)}</p>`;
    return;
  }
  if (!r.dados.length) {
    elLista.innerHTML = '<p class="dr-vazio">Ainda não há nenhuma atividade para a sua empresa.</p>';
    return;
  }
  elLista.innerHTML = r.dados.map(linhaAtividade).join('');
  elLista.querySelectorAll('[data-declarar]').forEach((b) => {
    b.addEventListener('click', () => abrirDeclarar(b.dataset.declarar));
  });
}

function abrirDeclarar(atividadeId) {
  atividadeParaDeclarar = atividadeId;
  const form = document.getElementById('form-declarar');
  form.reset();
  mostrarMsg(form.querySelector('.dr-msg'), '');
  abrirJanela('janela-declarar');
}

document.getElementById('form-declarar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const msg = form.querySelector('.dr-msg');
  const btn = form.querySelector('button[type="submit"]');
  const ficheiro = document.getElementById('ficheiro-declaracao').files[0];

  const erroFicheiro = ficheiroDeclaracaoValido(ficheiro);
  if (erroFicheiro) { mostrarMsg(msg, erroFicheiro, 'erro'); return; }

  btn.disabled = true;
  mostrarMsg(msg, 'A enviar…');

  const ctx = await quemSou();
  const caminho = `${ctx.empresa.cedula}/${atividadeParaDeclarar}.pdf`;
  const { error: erroUpload } = await sb.storage.from('atividades')
    .upload(caminho, ficheiro, { upsert: true, contentType: 'application/pdf' });
  if (erroUpload) {
    btn.disabled = false;
    mostrarMsg(msg, 'Não foi possível enviar o ficheiro. Tente novamente.', 'erro');
    return;
  }

  const r = await api('dr_atividade_declarar', { p_atividade_id: atividadeParaDeclarar, p_anexo_caminho: caminho });
  btn.disabled = false;
  if (!r.ok) { mostrarMsg(msg, r.erro, 'erro'); return; }

  document.getElementById('janela-declarar').close();
  await carregar();
});

// ── entrar ────────────────────────────────────────────────────────────
async function iniciar(ctx) {
  mostrarPainel();
  await montarTopo('minhas-atividades.html', ctx);
  await carregarTiposCatalogo();
  await carregar();
}

ligarVerSenha();
ligarFormularioLogin('form-login', async () => {
  const ctx = await quemSou();
  if (!ctx || !ctx.empresa) {
    mostrarMsg(document.querySelector('#form-login .dr-msg'),
      'Esta conta não está associada a nenhuma empresa.', 'erro');
    await sb.auth.signOut();
    return;
  }
  await iniciar(ctx);
});

(async function arrancar() {
  const ctx = await quemSou();
  if (!ctx || !ctx.empresa) { mostrarEntrada(); return; }
  await iniciar(ctx);
})();
