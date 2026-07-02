# Classificação das regras determinísticas do impeccable

**Fonte:** `pbakaus/impeccable` — detector determinístico (Apache-2.0). O plano referencia `impeccable@3.2.0`; a tag `v3.2.0` **não resolveu** no CDN `raw.githubusercontent.com` (404), então o código foi lido de `main` (release corrente à data: "Skill 3.9.1", 2026-07-01). O export `ANTIPATTERNS` em `cli/engine/registry/antipatterns.mjs` traz **exatamente 45 regras**, batendo com o esperado para 3.2.0 — mas a paridade byte-a-byte com a tag 3.2.0 **não foi verificada** (divergência a confirmar antes do vendoring).

**Arquivos lidos:**
- `cli/engine/registry/antipatterns.mjs` — os 45 IDs, `category` (`slop`|`quality`) e `severity` (`advisory` quando houver; alguns `gated` a provider gpt/gemini).
- `cli/engine/rules/checks.mjs` — checks de elemento/página (`checkElementBorders/Motion/Glow`, `checkPageTypography/Layout`, `checkHtmlPatterns`).
- `cli/engine/design-system.mjs` — checks `design-system-*` (comparam contra tokens de `DESIGN.md`).
- `cli/engine/engines/regex/detect-text.mjs` — checks de copy (texto puro).
- `cli/engine/engines/static-html/detect-html.mjs` — checks estáticos de HTML (jsdom, sem geometria).
- `cli/engine/detect-antipatterns-browser.js` — adapter browser (getComputedStyle + getBoundingClientRect reais).

**Propósito:** classificar cada regra por **decidibilidade estática por-arquivo** para decidir quais viram **linter de Standard** (`linter-static`) e quais ficam como **guidance** na skill.

## Critério

- **`linter-static`** — decidível por parsing estático de UM arquivo (regex ou AST de CSS/HTML), **sem** `getComputedStyle`/cascade, sem render, sem geometria (bounding rects), sem estado cross-file, sem tokens do design system do projeto. Onde há aproximação estática razoável, marca-se `linter-static` **com limitação anotada**.
- **`guidance`** — exige DOM renderizado, cor/estilo **computado** (luminância/contraste, background efetivo resolvido pela cascade/ancestrais), **geometria** (rects/viewport), estado **cross-file**, ou **tokens** do design system. Na dúvida entre os dois, preferiu-se `guidance`.

Sinal forte usado: o próprio impeccable tem um **engine estático (regex/detect-text/detect-html)** — regras que ele detecta ali são fortes candidatas a `linter-static`; regras que só existem no engine browser (computed/geometry) tendem a `guidance`.

## Tabela — 45 regras

| regra | category upstream | severity | destino | std-alvo | justificativa (≤15 palavras) |
|---|---|---|---|---|---|
| side-tab | slop | default | linter-static | std-design-antipatterns | Larguras/cor/raio de borda por-lado, declarações do próprio elemento (regex CSS). |
| border-accent-on-rounded | slop | default | linter-static | std-design-antipatterns | Borda colorida ≥2px + radius>0; declarações do elemento. |
| overused-font | slop | default | linter-static | std-design-antipatterns | Grep de font-family contra lista de fontes-tell conhecidas. |
| single-font | slop | default | linter-static | std-design-antipatterns | Conta font-family distintas declaradas no arquivo. |
| flat-type-hierarchy | slop | default | linter-static | std-design-antipatterns | Razão entre font-sizes declarados < 2.0. |
| gradient-text | slop | default | linter-static | std-design-antipatterns | `background-clip:text`+gradient ou classe `bg-clip-text`; regex puro. |
| ai-color-palette | slop | default | linter-static | std-design-antipatterns | Hue roxo/ciano de cor literal; regex de hex. |
| cream-palette | slop | default | linter-static | std-design-antipatterns | Classifica bg-color creme por thresholds RGB literais. |
| nested-cards | slop | default | guidance | — | Card-dentro-de-card via ancestralidade DOM + geometria de rect. |
| monotonous-spacing | slop | default | linter-static | std-design-antipatterns | Histograma de padding/margin/gap declarados; valor dominante >60%. |
| bounce-easing | slop | default | linter-static | std-design-antipatterns | Regex em animation-name/cubic-bezier; declaração literal de CSS. |
| dark-glow | slop | default | guidance | — | Exige luminância do background do ancestral resolvido (fundo escuro). |
| icon-tile-stack | slop | default | guidance | — | Geometria: tamanho do ícone e empilhamento vertical via rects. |
| italic-serif-display | slop | default | linter-static | std-design-antipatterns | font-style italic + serif + tamanho de heading; props do elemento. |
| hero-eyebrow-chip | slop | default | guidance | — | Correlação estrutural (irmão antes do h1) + tipografia resolvida. |
| repeated-section-kickers | slop | advisory | guidance | — | Agrupa "kickers" por estilo resolvido + texto repetido antes de headings. |
| numbered-section-markers | slop | advisory | linter-static | std-design-antipatterns | Regex 01–12 no texto; conta pares sequenciais. |
| em-dash-overuse | slop | default | linter-static | std-design-antipatterns | Conta em-dash/`--` no texto (≥5); texto puro. |
| marketing-buzzword | slop | default | linter-static | std-design-antipatterns | Wordlist de buzzwords sobre texto stripado. |
| aphoristic-cadence | slop | default | linter-static | std-design-antipatterns | Regex de padrões de cadência sobre texto (≥3). |
| oversized-h1 | slop | default | guidance | — | Exige rect renderizado vs proporção do viewport. |
| extreme-negative-tracking | slop | default | linter-static | std-design-antipatterns | letter-spacing ≤ -0.05em; declaração literal. |
| gpt-thin-border-wide-shadow | slop | advisory (gated:gpt) | linter-static | std-design-antipatterns | Borda hairline + box-shadow de blur largo no mesmo elemento. |
| repeating-stripes-gradient | slop | advisory (gated:gpt) | linter-static | std-design-antipatterns | Regex `repeating-*-gradient(` sobre HTML/CSS. |
| codex-grid-background | slop | advisory (gated:gpt) | linter-static | std-design-antipatterns | Stops hairline + background-size num mesmo bloco de estilo. |
| theater-slop-phrase | slop | advisory (gated:gpt) | linter-static | std-design-antipatterns | Regex `\w+ theater` sobre texto do body. |
| image-hover-transform | slop | advisory (gated:gemini) | linter-static | std-design-antipatterns | Regex `img:hover{transform}` ou classe `hover:scale/rotate`. |
| broken-image | quality | default | linter-static | std-visual-quality | Inspeção estática do atributo `src` (vazio/`#`/placeholder). |
| gray-on-color | quality | default | guidance | — | Exige cor de texto + background de ancestral resolvidos (chroma). |
| low-contrast | quality | default | guidance | — | Exige luminância/contraste resolvidos entre texto e bg ancestral. |
| layout-transition | quality | default | linter-static | std-visual-quality | transition-property inclui width/height/padding/margin; declaração literal. |
| line-length | quality | default | guidance | — | Usa largura renderizada do rect ÷ font-size (geometria). |
| cramped-padding | quality | default | guidance | — | Compara padding com font-size escalado por rect (geometria). |
| body-text-viewport-edge | quality | default | guidance | — | Posição do rect vs bordas do viewport (geometria). |
| tight-leading | quality | default | guidance | — | Razão line-height/font-size computada; caso px depende de cascade. |
| skipped-heading | quality | default | linter-static | std-accessibility | Ordem de níveis de heading via AST estático de HTML. |
| justified-text | quality | default | linter-static | std-visual-quality | `text-align:justify` (+hyphens); declaração literal. |
| tiny-text | quality | default | linter-static | std-accessibility | `font-size` literal < 12px em texto de corpo. |
| all-caps-body | quality | default | linter-static | std-visual-quality | `text-transform:uppercase` em texto não-heading; declaração. |
| wide-tracking | quality | default | linter-static | std-visual-quality | `letter-spacing` > 0.05em em texto de corpo. |
| text-overflow | quality | default | guidance | — | Exige scrollWidth vs clientWidth / rect (render). |
| clipped-overflow-container | quality | default | guidance | — | overflow computado + posição/geometria do filho (render). |
| design-system-font | quality | default | guidance | — | Compara fonte contra tokens de `DESIGN.md` (cross-file). |
| design-system-color | quality | advisory | guidance | — | Compara cor contra paleta de `DESIGN.md` (cross-file). |
| design-system-radius | quality | advisory | guidance | — | Compara radius contra escala de `DESIGN.md` (cross-file). |

## Limitações das `linter-static` (aproximações a anotar no Standard)

- **overused-font / single-font / flat-type-hierarchy / monotonous-spacing** — agregam declarações do arquivo; **não resolvem cascade/herança** (valor efetivo por elemento pode divergir) nem unidades responsivas (`clamp()`/`rem`/`vw`). Aproximação razoável, mas com falsos negativos/positivos.
- **side-tab / border-accent-on-rounded / gpt-thin-border-wide-shadow** — sensíveis a shorthand `border` vs por-lado e à cascade; casam a declaração literal.
- **ai-color-palette / cream-palette** — classificam a cor literal; o gate "em heading/texto grande" (ai-color) e "qual elemento é o bg da página" (cream) depende de cascade — fallback por regex de hex é puro-estático.
- **bounce-easing** — não segue `@keyframes` nomeados definidos noutro ponto/arquivo.
- **layout-transition** — não pega `transition: all` nem valores resolvidos pela cascade.
- **numbered-section-markers / aphoristic-cadence / theater-slop-phrase** — heurísticas de texto; sujeitas a falsos positivos.
- **skipped-heading** — estático dentro de UM arquivo HTML; apps multi-componente (JSX) precisam de **resolução cross-file** da ordem de headings (aí vira guidance).
- **tiny-text** — `font-size < 12px` é limpo, mas a exclusão de "contexto UI" e herança não são conhecíveis estaticamente; pode gerar ruído.
- **broken-image** — só detecta `src` vazio/placeholder/`#`; **não** detecta URL realmente quebrada (exigiria render/rede).
- **A11y (skipped-heading, tiny-text)** — exigem **ampliar o `applyTo`** do Standard de `tsx/jsx` para **`css`/`html`**. `alt` **não** entra (já coberto por outro std).

## Resumo

- **Total:** 45 regras — **28 `linter-static`** / **17 `guidance`**.

**Por std-alvo (as 28 `linter-static`):**
- `std-design-antipatterns` (category `slop`): **21** — side-tab, border-accent-on-rounded, overused-font, single-font, flat-type-hierarchy, gradient-text, ai-color-palette, cream-palette, monotonous-spacing, bounce-easing, italic-serif-display, numbered-section-markers, em-dash-overuse, marketing-buzzword, aphoristic-cadence, extreme-negative-tracking, gpt-thin-border-wide-shadow, repeating-stripes-gradient, codex-grid-background, theater-slop-phrase, image-hover-transform.
- `std-visual-quality` (category `quality`, não-a11y): **5** — broken-image, layout-transition, justified-text, all-caps-body, wide-tracking.
- `std-accessibility` (a11y estáticas): **2** — skipped-heading, tiny-text.

**As 17 `guidance` (motivo em uma linha):**
- **nested-cards** — ancestralidade DOM (card-em-card) + geometria de rect.
- **dark-glow** — luminância do background do ancestral resolvido (fundo escuro).
- **icon-tile-stack** — geometria: tamanho do ícone e empilhamento vertical via rects.
- **hero-eyebrow-chip** — correlação estrutural (irmão antes do h1) + tipografia resolvida.
- **repeated-section-kickers** — agrupamento cross-element por estilo resolvido + texto repetido.
- **oversized-h1** — rect renderizado vs proporção do viewport.
- **gray-on-color** — cor de texto + background de ancestral resolvidos (chroma).
- **low-contrast** — luminância/contraste resolvidos entre texto e bg ancestral.
- **line-length** — largura renderizada do rect ÷ font-size (geometria).
- **cramped-padding** — padding vs font-size escalado por rect (geometria).
- **body-text-viewport-edge** — posição do rect vs bordas do viewport (geometria).
- **tight-leading** — razão line-height/font-size computada; caso `px` depende de cascade.
- **text-overflow** — scrollWidth vs clientWidth / rect (render).
- **clipped-overflow-container** — overflow computado + posição/geometria do filho (render).
- **design-system-font** — comparação contra tokens de `DESIGN.md` (cross-file).
- **design-system-color** — comparação contra paleta de `DESIGN.md` (cross-file).
- **design-system-radius** — comparação contra escala de `DESIGN.md` (cross-file).
