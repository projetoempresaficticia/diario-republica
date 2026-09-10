// Diário da República — a montra pública de atividades.
//
// Pública de propósito: qualquer pessoa vê o que está pedido, sem sessão,
// tal como o Diário da República verdadeiro é de leitura livre. Só
// "As minhas atividades" (o estado de cumprimento de cada empresa) e
// "Publicar atividade" (a professora) é que pedem sessão.

const elLista = document.getElementById('lista');

function cartaoAtividade(a) {
  return `
    <article class="dr-cartao" style="margin-bottom:var(--dr-e4)">
      <div class="cabeca">
        <h3>${esc(a.titulo)}</h3>
      </div>
      <div class="descricao">${limparHtml(a.texto)}</div>
      <p class="dr-suave" style="font-size:13px;margin-top:var(--dr-e2)">
        Prazo: ${esc(formatarData(a.prazo))} · publicada ${esc(haQuanto(a.criada_em))}
      </p>
    </article>`;
}

async function carregar() {
  const r = await api('dr_atividades_publicas');
  if (!r.ok) {
    elLista.innerHTML = `<p class="dr-vazio">${esc(r.erro)}</p>`;
    return;
  }
  if (!r.dados.length) {
    elLista.innerHTML = '<p class="dr-vazio">Ainda não há nenhuma atividade publicada.</p>';
    return;
  }
  elLista.innerHTML = r.dados.map(cartaoAtividade).join('');
}

(async function arrancar() {
  const ctx = await quemSou();
  await montarTopo('index.html', ctx);
  await carregar();
})();
