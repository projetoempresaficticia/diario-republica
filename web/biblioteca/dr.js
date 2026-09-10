// Diário da República — utilitários partilhados. Nesta fase, só o que a
// própria biblioteca usa; o resto (quemSou, montarTopo, api…) chega
// quando a camada de dados existir, tal como nos outros apps.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Clique num "chip" de cor da biblioteca copia o hex — pequeno, mas é o
// que se faz mesmo com uma referência de paleta.
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
