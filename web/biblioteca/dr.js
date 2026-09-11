// Diário da República — utilitários partilhados. Portado de
// talentos/web/biblioteca/ta.js, adaptado ao domínio (atividades, não
// vagas/candidaturas) e ao facto de haver dois papéis privados
// (professora e empresa), não só um.
// O cliente Supabase (`sb`) e o `api()` vêm do comum.js da pp-base.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mostrarMsg(el, texto, tipo) {
  if (!el) return;
  el.textContent = texto || '';
  el.className = 'dr-msg' + (tipo ? ' dr-msg-' + tipo : '');
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-PT',
    { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// "Há 2 dias" — o que interessa numa lista é a idade, não a data exata.
function haQuanto(iso) {
  if (!iso) return '';
  const dias = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses === 1) return 'há 1 mês';
  return `há ${meses} meses`;
}

// Dinheiro é sempre cêntimos (bigint) na base — formata-se só ao mostrar.
function formatarDinheiro(centavos) {
  const v = Number(centavos || 0) / 100;
  return 'P$ ' + v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// A prova que dr_minhas_atividades devolve tem formas diferentes por
// tipo (protocolo, valor, anexo…) — isto lê o que houver, sem assumir
// que todos os campos existem.
function textoDaProva(prova) {
  if (!prova) return '';
  const partes = [];
  if (prova.protocolo) partes.push('protocolo ' + prova.protocolo);
  if (prova.codigo_auth) partes.push('ref. ' + prova.codigo_auth);
  if (prova.titulo) partes.push('"' + prova.titulo + '"');
  if (prova.valor != null) partes.push(formatarDinheiro(prova.valor));
  if (prova.criada_em) partes.push(haQuanto(prova.criada_em));
  else if (prova.declarada_em) partes.push('declarada ' + haQuanto(prova.declarada_em));
  return partes.join(' · ');
}

// Documento real por trás de uma prova — nem toda teve um anexo (uma
// vaga publicada é só uma linha na base, não um ficheiro), por isso o
// botão só aparece quando existe um caminho mesmo. `anexo_caminho`
// (bucket 'atividades', autodeclaração) e `arquivo_caminho` (bucket
// 'documentos', tudo o resto assinado no Subsight) vivem em buckets
// diferentes; a RLS de cada um já decide quem pode gerar o signed URL —
// não é preciso verificar nada aqui.
function caminhoDocumentoDaProva(prova) {
  if (!prova) return null;
  if (prova.arquivo_caminho) {
    return { bucket: 'documentos', caminho: prova.arquivo_caminho, nome: prova.arquivo_nome || 'Documento' };
  }
  if (prova.anexo_caminho) return { bucket: 'atividades', caminho: prova.anexo_caminho, nome: 'Anexo enviado' };
  return null;
}

// Janela única, criada na primeira vez que é precisa — assim nenhuma
// página tem de lembrar-se de incluir o <dialog> no seu próprio HTML.
function janelaDocumento() {
  let d = document.getElementById('dr-janela-documento');
  if (d) return d;
  d = document.createElement('dialog');
  d.id = 'dr-janela-documento';
  d.className = 'dr-janela-documento';
  d.innerHTML = `
    <div class="dr-janela-cabeca">
      <h2 id="dr-janela-documento-titulo">Documento</h2>
      <button type="button" class="dr-icone-botao" aria-label="Fechar">
        <span class="dr-icone i-fechar" aria-hidden="true"></span>
      </button>
    </div>
    <div class="dr-janela-corpo"><p class="dr-vazio">A abrir…</p></div>`;
  document.body.appendChild(d);
  d.querySelector('.dr-janela-cabeca button').addEventListener('click', () => d.close());
  d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); });
  return d;
}

// Erro fica dentro da própria janela (mesmo espírito do resto do app:
// mensagens inline, nunca alert() nativo).
async function abrirDocumentoStorage(bucket, caminho, nome) {
  const d = janelaDocumento();
  const corpo = d.querySelector('.dr-janela-corpo');
  d.querySelector('#dr-janela-documento-titulo').textContent = nome || 'Documento';
  corpo.innerHTML = '<p class="dr-vazio">A abrir…</p>';
  if (!d.open) d.showModal();

  const { data, error } = await sb.storage.from(bucket).createSignedUrl(caminho, 300);
  if (error || !data) {
    corpo.innerHTML = '<p class="dr-vazio">Não foi possível abrir o documento.</p>';
    return;
  }
  corpo.innerHTML = `<iframe src="${esc(data.signedUrl)}" title="${esc(nome || 'Documento')}"></iframe>`;
}

// Botão "Ver documento" — string vazia se esta prova não tiver nenhum
// ficheiro por trás. `ligarBotoesDocumento` liga o clique depois de o
// HTML entrar na página (mesmo padrão de data-declarar/data-alternar
// já usado no resto do app).
function botaoVerDocumento(prova) {
  const ref = caminhoDocumentoDaProva(prova);
  if (!ref) return '';
  return `<button type="button" class="dr-botao dr-botao-linha dr-botao-pequeno"
            data-ver-documento="${esc(ref.bucket)}|${esc(ref.caminho)}" data-nome-documento="${esc(ref.nome)}">
    <span class="dr-icone dr-icone-16 i-documento" aria-hidden="true"></span>Ver documento</button>`;
}

function ligarBotoesDocumento(raiz) {
  (raiz || document).querySelectorAll('[data-ver-documento]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const valor = btn.dataset.verDocumento;
      const i = valor.indexOf('|');
      abrirDocumentoStorage(valor.slice(0, i), valor.slice(i + 1), btn.dataset.nomeDocumento);
    });
  });
}

// ── selo de uma atividade ─────────────────────────────────────────────
// Não é um único `estado` de coluna — é `cumprida`/`atrasada` calculados
// ao vivo pelo dr_minhas_atividades. Prazo ultrapassado sem cumprir pinta
// a vermelho sozinho; não existe estado "encerrada" (ver
// docs/TAREFAS-DIARIO-REPUBLICA.md).
function seloAtividade(a) {
  if (a.cumprida) {
    return '<span class="dr-selo dr-selo-concluido"><span class="ponto"></span>Cumprida</span>';
  }
  if (a.atrasada) {
    return '<span class="dr-selo dr-selo-urgente"><span class="ponto"></span>Atrasada</span>';
  }
  return '<span class="dr-selo dr-selo-em-curso"><span class="ponto"></span>Por cumprir</span>';
}

// ── quem sou ──────────────────────────────────────────────────────────
// `pessoa.papel === 'professor'` já vem nesta consulta — não é preciso
// outra chamada para saber se quem entrou pode publicar atividades.
async function quemSou() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  const { data: pessoa } = await sb
    .from('pessoas').select('cedula, nome, papel, empresa_id')
    .eq('id', data.session.user.id).single();
  if (!pessoa) return null;
  let empresa = null;
  if (pessoa.empresa_id) {
    const { data: e } = await sb
      .from('empresas').select('cedula, nome').eq('id', pessoa.empresa_id).single();
    empresa = e || null;
  }
  return { pessoa, empresa };
}

// ── versão do site nos links internos ────────────────────────────────
// O GitHub Pages guarda o HTML dez minutos e não deixa mudar isso.
function versaoDoSite() {
  const m = document.querySelector('meta[name="dr-versao"]');
  return (m && m.content) ? m.content : '';
}

function comVersao(href) {
  const v = versaoDoSite();
  if (!v || /^https?:/.test(href)) return href;
  const [caminho, resto] = href.split('?');
  const params = new URLSearchParams(resto || '');
  params.set('v', v);
  return caminho + '?' + params.toString();
}

function versionarLinks() {
  document.querySelectorAll('a[href$=".html"], a[href*=".html?"]').forEach((a) => {
    const h = a.getAttribute('href');
    if (!h || /^https?:/.test(h) || /[?&]v=/.test(h)) return;
    a.setAttribute('href', comVersao(h));
  });
}
document.addEventListener('DOMContentLoaded', versionarLinks);

// ── o cabeçalho, montado uma vez, com o estado de sessão ─────────────
// Cada página tem <header id="topo"></header> vazio no HTML; isto
// preenche-o. Só uma função, para as páginas nunca desalinharem.
async function montarTopo(paginaAtual, ctx) {
  const el = document.getElementById('topo');
  if (!el) return;
  el.className = 'dr-topo';

  const ehProfessor = !!(ctx && ctx.pessoa && ctx.pessoa.papel === 'professor');
  const areaPropria = ehProfessor
    ? { href: 'professora.html', nome: 'Publicar atividade' }
    : { href: 'minhas-atividades.html', nome: 'As minhas atividades' };

  el.innerHTML = `
    <div class="dr-topo-int">
      <a class="dr-marca" href="${comVersao('index.html')}">
        <picture>
          <source srcset="web/marca/dr-marca.webp" type="image/webp" />
          <img src="web/marca/dr-marca.png" alt="" width="32" height="32" />
        </picture>
        Diário da República
      </a>
      <nav aria-label="Navegação principal">
        <a href="${comVersao('index.html')}"
           ${paginaAtual === 'index.html' ? 'aria-current="page"' : ''}>Atividades</a>
        ${ctx ? `
          <a href="${comVersao(areaPropria.href)}"
             ${paginaAtual === areaPropria.href ? 'aria-current="page"' : ''}>
            ${esc(areaPropria.nome)}
          </a>
          ${ehProfessor ? `
            <a href="${comVersao('acompanhar.html')}"
               ${paginaAtual === 'acompanhar.html' ? 'aria-current="page"' : ''}>
              Acompanhar
            </a>` : ''}
          <span class="dr-quem">${esc(ctx.empresa ? ctx.empresa.nome : ctx.pessoa.nome)}</span>
          <button type="button" class="link" id="btn-sair-topo">
            <span class="dr-icone dr-icone-16 i-sair" aria-hidden="true"></span>Sair
          </button>` : `
          <a href="${comVersao('entrar.html?voltar=' + encodeURIComponent(
            window.location.pathname.split('/').pop() + window.location.search))}">Entrar</a>`}
      </nav>
    </div>`;

  const btnSair = document.getElementById('btn-sair-topo');
  if (btnSair) btnSair.addEventListener('click', async () => {
    // O recarregar tem de acontecer mesmo que o signOut falhe (sessão já
    // expirada, rede instável) — senão o botão parece não fazer nada.
    try { await sb.auth.signOut(); } catch (e) { /* sai da vista de qualquer forma */ }
    window.location.reload();
  });
}

// ── janelas ───────────────────────────────────────────────────────────
// <dialog> nativo: já traz a armadilha de foco, o Escape e o fundo inerte.
function abrirJanela(id) {
  const d = document.getElementById(id);
  if (d && !d.open) d.showModal();
  return d;
}

function ligarFechos() {
  document.querySelectorAll('[data-fechar]').forEach((b) => {
    b.addEventListener('click', () => {
      const d = document.getElementById(b.dataset.fechar);
      if (d) d.close();
    });
  });
}
document.addEventListener('DOMContentLoaded', ligarFechos);

function ligarVerSenha(sufixo) {
  const btn = document.getElementById('btn-ver-senha' + (sufixo || ''));
  const campo = document.getElementById('senha' + (sufixo || ''));
  if (!btn || !campo) return;
  btn.addEventListener('click', () => {
    const aMostrar = campo.type === 'password';
    campo.type = aMostrar ? 'text' : 'password';
    btn.textContent = aMostrar ? 'Esconder' : 'Mostrar';
    btn.setAttribute('aria-pressed', String(aMostrar));
    campo.focus();
  });
}

// Login genérico: serve tanto a janela modal como o ecrã de entrada de
// página inteira — o formulário e os ids dos campos são os mesmos, só o
// contentor muda.
function ligarFormularioLogin(idForm, aoEntrar) {
  const form = document.getElementById(idForm);
  if (!form) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = form.querySelector('.dr-msg');
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    mostrarMsg(msg, 'A entrar…');
    const { error } = await sb.auth.signInWithPassword({
      email: form.querySelector('[name="email"]').value,
      password: form.querySelector('[name="senha"]').value,
    });
    if (btn) btn.disabled = false;
    if (error) {
      mostrarMsg(msg, 'Email ou senha errados.', 'erro');
      return;
    }
    mostrarMsg(msg, '');
    await aoEntrar();
  });
}

// Uma pergunta de sim ou não, com a janela do app.
function perguntar(titulo, texto, rotuloSim) {
  return new Promise((resolve) => {
    const janela = document.getElementById('janela-confirmar');
    document.getElementById('titulo-confirmar').textContent = titulo;
    document.getElementById('texto-confirmar').textContent = texto;
    const btn = document.getElementById('btn-confirmar');
    btn.textContent = rotuloSim || 'Confirmar';

    let respondido = false;
    function limpar() {
      janela.removeEventListener('close', aoFechar);
      btn.removeEventListener('click', aoSim);
    }
    function aoSim() { respondido = true; limpar(); janela.close(); resolve(true); }
    function aoFechar() { limpar(); if (!respondido) resolve(false); }

    btn.addEventListener('click', aoSim);
    janela.addEventListener('close', aoFechar);
    janela.showModal();
  });
}

// ── texto formatado (o corpo de uma atividade) ───────────────────────
// Guardar o que a professora escreveu e desenhá-lo no ecrã de outra
// pessoa é a porta clássica do XSS. A defesa a sério é esta limpeza por
// lista branca — feita num documento à parte, INERTE, onde nada corre.
// `dr_atividade_publicar` recusa o mesmo conjunto do lado do servidor:
// são duas peças a dizer o mesmo, de propósito (mesmo padrão do
// AeroMail e do Talentos).
const DR_ETIQUETAS = {
  B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, A: 1, BR: 1,
  P: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1,
};
const DR_ATRIBUTOS = { A: ['href'] };

function limparNoDr(pai) {
  Array.from(pai.childNodes).forEach((no) => {
    if (no.nodeType === 3) return;                        // texto fica
    if (no.nodeType !== 1) { no.remove(); return; }        // comentários fora

    const etiqueta = String(no.tagName || '').toUpperCase();
    limparNoDr(no);                                        // os filhos primeiro

    if (etiqueta === 'SCRIPT' || etiqueta === 'STYLE') { no.remove(); return; }
    if (!DR_ETIQUETAS[etiqueta]) {
      while (no.firstChild) pai.insertBefore(no.firstChild, no);  // desembrulhar
      no.remove();
      return;
    }

    const permitidos = DR_ATRIBUTOS[etiqueta] || [];
    Array.from(no.attributes).forEach((at) => {
      if (permitidos.indexOf(at.name.toLowerCase()) >= 0) return;
      no.removeAttribute(at.name);
    });

    if (etiqueta === 'A') {
      const h = (no.getAttribute('href') || '').trim();
      if (!/^(https?:|mailto:)/i.test(h)) {
        no.removeAttribute('href');
      } else {
        no.setAttribute('target', '_blank');
        no.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
  });
}

function limparHtml(html) {
  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = String(html == null ? '' : html);
  limparNoDr(doc.body);
  return doc.body.innerHTML;
}

// ── validar o anexo de uma declaração antes de subir ─────────────────
// Só uma verificação amigável — o bucket já recusa no servidor o que não
// for PDF ou passar de 10 MB.
function ficheiroDeclaracaoValido(ficheiro) {
  if (!ficheiro) return 'Escolha um ficheiro.';
  if (ficheiro.type !== 'application/pdf') return 'O anexo tem de ser um PDF.';
  if (ficheiro.size > 10 * 1024 * 1024) return 'O ficheiro não pode passar de 10 MB.';
  return null;
}

// Clique num "chip" de cor da biblioteca copia o hex.
function ligarCopiarHex() {
  document.querySelectorAll('[data-copiar]').forEach((el) => {
    el.addEventListener('click', async () => {
      const valor = el.dataset.copiar;
      try {
        await navigator.clipboard.writeText(valor);
        const anterior = el.dataset.rotuloOriginal || el.textContent;
        el.dataset.rotuloOriginal = anterior;
        el.textContent = 'Copiado!';
        setTimeout(() => { el.textContent = anterior; }, 1100);
      } catch (e) { /* sem permissão de clipboard: não é crítico aqui */ }
    });
  });
}
document.addEventListener('DOMContentLoaded', ligarCopiarHex);
