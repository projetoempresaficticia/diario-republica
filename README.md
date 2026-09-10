# Diário da República

Publicações oficiais, editais e avisos legais do ecossistema Prepara
Portugal — o quarto órgão do Estado (`pp-orgaos`), junto com AT
(`portal-financas`), Segurança Social (`seguranca-social`) e Cartório
Notarial (`cartorio-notarial`).

Segue os padrões da `pp-base`: Supabase (Postgres + Auth + RLS) para
dados, GitHub Pages para o HTML estático, sem framework nem passo de
compilação.

## Estado

- [x] Identidade visual (`biblioteca.html`) — paleta corrigida por
  contraste medido (WCAG), tipografia, componentes.
- [ ] Camada de dados (`sql/`) — por fazer.
- [ ] Frontend da app — por fazer.

`biblioteca.html` é só referência de desenho — não deve ficar
publicada junto da app quando esta existir (mesma regra do Talentos).

## Publicar as versões

```
python ferramentas/versoes.py
```
