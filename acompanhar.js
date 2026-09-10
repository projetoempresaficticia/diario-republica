// Diário da República — a professora acompanha, por atividade publicada,
// que empresas já cumpriram, sem ter de entrar em cada uma a uma.

const elAVerificar = document.getElementById('a-verificar');
const elEntrada = document.getElementById('entrada');
const elPainel = document.getElementById('painel');
const elLista = document.getElementById('lista');

let tiposPorNome = {};

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

async function carregarTiposCatalogo() {
  const { data } = await sb.from('atividade_tipos').select('tipo, descricao');
  (data || []).forEach((t) => { tiposPorNome[t.tipo] = t; });
}

// Um bloco por prova: o selo (tag de estado), o protocolo/referência
// quando existe, e o botão para abrir o documento real — "cumprida" sozinho
// não prova nada, o que convence é o número e o ficheiro por trás dele.
function blocoProva(p) {
  const label = p.tipo === null
    ? (p.cumprida ? 'Anexo entregue' : 'Por declarar')
    : (tiposPorNome[p.tipo] ? tiposPorNome[p.tipo].descricao : p.tipo);
  const classe = p.cumprida ? 'dr-selo-concluido' : 'dr-selo-em-curso';
  const detalhe = textoDaProva(p.prova);
  const botao = botaoVerDocumento(p.prova);
  return `
    <div style="margin-bottom:8px">
      <span class="dr-selo ${classe}"><span class="ponto"></span>${esc(label)}</span>
      ${detalhe ? `<div class="dr-suave" style="font-size:12.5px;margin-top:3px">${esc(detalhe)}</div>` : ''}
      ${botao ? `<div style="margin-top:4px">${botao}</div>` : ''}
    </div>`;
}

function linhaEmpresa(e, atividade) {
  const atrasada = !e.cumprida && new Date(atividade.prazo) < new Date();
  const classeSelo = e.cumprida ? 'dr-selo-concluido' : (atrasada ? 'dr-selo-urgente' : 'dr-selo-em-curso');
  const textoSelo = e.cumprida ? 'Cumprida' : (atrasada ? 'Atrasada' : 'Por cumprir');
  return `
    <tr>
      <td>${esc(e.nome)}</td>
      <td class="mono">${esc(e.cedula)}</td>
      <td><span class="dr-selo ${classeSelo}"><span class="ponto"></span>${textoSelo}</span></td>
      <td>${e.provas.map(blocoProva).join('')}</td>
    </tr>`;
}

function cartaoAtividade(a) {
  const total = a.empresas.length;
  const cumpridas = a.empresas.filter((e) => e.cumprida).length;
  const pct = total ? Math.round((cumpridas / total) * 100) : 0;
  const tiposTexto = a.tipos.length
    ? a.tipos.map((t) => (tiposPorNome[t] ? tiposPorNome[t].descricao : t)).join(' + ')
    : 'Sem tipo — autodeclaração com anexo';

  return `
    <article class="dr-cartao" style="margin-bottom:var(--dr-e4)">
      <div class="cabeca">
        <h3>${esc(a.titulo)}</h3>
        <span class="dr-suave" style="font-size:13px;white-space:nowrap">${cumpridas} de ${total}</span>
      </div>
      <p class="dr-suave" style="font-size:13.5px;margin:2px 0 0">${esc(tiposTexto)}</p>
      <p class="dr-suave" style="font-size:13px;margin-top:4px">Prazo: ${esc(formatarData(a.prazo))}</p>
      <div class="dr-progresso" style="margin-top:var(--dr-e3)"><b style="width:${pct}%"></b></div>
      <div class="dr-progresso-rotulo">${pct}%</div>
      <button type="button" class="dr-botao dr-botao-linha dr-botao-pequeno"
              style="margin-top:var(--dr-e3)" data-alternar="${esc(a.id)}">Ver empresas</button>
      <div class="dr-tabela-envolt" id="tabela-${esc(a.id)}" hidden style="margin-top:var(--dr-e3)">
        <table class="dr-tabela">
          <thead><tr><th>Empresa</th><th>Cédula</th><th>Estado</th><th>Detalhe</th></tr></thead>
          <tbody>${a.empresas.map((e) => linhaEmpresa(e, a)).join('')}</tbody>
        </table>
      </div>
    </article>`;
}

async function carregar() {
  const r = await api('dr_professor_acompanhar');
  if (!r.ok) {
    elLista.innerHTML = `<p class="dr-vazio">${esc(r.erro)}</p>`;
    return;
  }
  if (!r.dados.length) {
    elLista.innerHTML = '<p class="dr-vazio">Ainda não publicou nenhuma atividade.</p>';
    return;
  }
  elLista.innerHTML = r.dados.map(cartaoAtividade).join('');
  elLista.querySelectorAll('[data-alternar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabela = document.getElementById('tabela-' + btn.dataset.alternar);
      const aberta = !tabela.hidden;
      tabela.hidden = aberta;
      btn.textContent = aberta ? 'Ver empresas' : 'Ocultar empresas';
    });
  });
  ligarBotoesDocumento(elLista);
}

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
  await montarTopo('acompanhar.html', ctx);
  await carregarTiposCatalogo();
  await carregar();
});

(async function arrancar() {
  const ctx = await quemSou();
  if (!ctx || !ctx.pessoa || ctx.pessoa.papel !== 'professor') { mostrarEntrada(); return; }
  mostrarPainel();
  await montarTopo('acompanhar.html', ctx);
  await carregarTiposCatalogo();
  await carregar();
})();
