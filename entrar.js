// Diário da República — página de login a sério, não um popup.
//
// A montra de atividades é pública e continua a poder ser vista sem
// sessão; "Entrar" leva para aqui e, depois de entrar, volta-se para
// onde se estava (`voltar`).

const params = new URLSearchParams(window.location.search);
const voltar = params.get('voltar') || 'index.html';

document.getElementById('link-voltar').setAttribute('href', comVersao(voltar));

ligarVerSenha();
ligarFormularioLogin('form-login', async () => {
  window.location.href = comVersao(voltar);
});

// Quem já tem sessão e chega aqui (por exemplo, voltou atrás no
// histórico) não precisa de ver o formulário outra vez.
(async function arrancar() {
  const ctx = await quemSou();
  if (ctx) window.location.replace(comVersao(voltar));
})();
