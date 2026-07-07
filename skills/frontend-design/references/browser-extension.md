# Extensão de navegador (impeccable) — instalação standalone

## Objetivo

Documentar a extensão Chrome do impeccable como um recurso **opcional e standalone** — o DevFlow **não** a distribui nem a reconstrói.

## Por que não é reconstruída

A extensão Chrome do impeccable é um overlay (MV3) que roda **o mesmo detector das regras** que o DevFlow já absorveu como linters de Standards (`std-design-antipatterns`/`std-visual-quality`/`std-accessibility`). Reconstruí-la duplicaria essa lógica sem agregar valor sobre o linter (que roda automaticamente no `post-tool-use`) + o guia `frontend-design`. Além disso, a Chrome Web Store é um canal de distribuição próprio, fora do escopo de um plugin do Claude Code. Ver ADR-010 (guardrail: não reconstruir artefatos que já são canais próprios do upstream).

## Quando usar

Quando você quiser um **overlay visual do detector em qualquer página web** (não só nos arquivos que você edita) — por exemplo, auditar um site em produção no próprio navegador.

## Passos

1. Instalar a extensão **diretamente da Chrome Web Store** (busque por "impeccable" / veja o link no repositório upstream `https://github.com/pbakaus/impeccable`). É código de terceiros (Apache-2.0), gerenciado por você — fora do TCB do DevFlow.
2. Usar o overlay da extensão para inspecionar páginas renderizadas — ele complementa (não substitui) os linters de Standards do DevFlow, que agem em tempo de edição.
3. Para enforcement no fluxo de código, prefira os linters do DevFlow (automáticos) + `/devflow:design audit`/`critique` (guidance). A extensão é para inspeção visual ad-hoc no navegador.

## Nota

O modo `live` (`/devflow:design live`) é coisa diferente da extensão: é iteração ao vivo no dev server via bridge (`scripts/design/live-bridge.mjs`), não um overlay de página. Ver `live.md`.
