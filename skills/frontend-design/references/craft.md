# craft — construir uma feature de UI com qualidade de estúdio

## Objetivo

Construir uma feature de front-end com UX e UI impecáveis: dar forma ao design (`shape`), fechar a direção visual, implementar código de produção real e inspecionar/refinar no navegador até bater a régua de um estúdio de alto nível. É o modo "do briefing ao pixel", ponta a ponta.

## Quando usar

- Feature de UI nova ou reescrita significativa em que você controla o design e o código.
- Depois que a intenção está clara mas a direção visual ainda precisa ser fechada.
- Quando o usuário pede "constrói/faz a tela X" e há espaço para design, não só implementação mecânica.

Se a feature já tem design aprovado e você só vai codar, o dono da implementação é o agente `frontend-specialist` (fase E) — esta skill entra para **definir** o design que ele executa.

## Grounding (obrigatório antes de qualquer passo)

Leia o knowledge de negócio como contrato de contexto — nunca duplique, referencie via `@`:
- `@.context/product/product-design-system.md` — princípios de UX/visual + **tokens** (paleta, tipografia, espaçamento, raios).
- `@.context/product/product-tone-of-voice.md` — voz/vocabulário (governa copy, labels, erros).
- `@.context/business/business-icp.md` — para quem é (JTBD/densidade/prioridades).

Se algum não existir, ofereça criá-los via `/devflow:knowledge` antes de prosseguir. Esse knowledge é contexto de projeto, não briefing da task — o briefing sai do `shape`.

## Passos

### Passo 0 — Fundação do projeto

Antes de dar forma, antes de codar: entenda em que tipo de projeto você está. Rode `ls`; procure framework já existente (`astro.config`, `next.config`, `vite.config`, `package.json` com deps, etc.), biblioteca de componentes/design system (`src/components/`, `tokens.css`, `theme.ts`) e set de ícones já adotado (`lucide-*`, `@phosphor-icons/*`, sprites próprios). **Se existe, use.** Não inicie um build paralelo, não introduza um segundo framework, não escreva direto em `dist/`/`build/`. Se for greenfield, **pergunte** o alvo (via AskUserQuestion) com defaults sensatos — não escolha framework em silêncio.

### Passo 1 — Dar forma (shape)

Rode o modo `shape` com a descrição da feature. `shape` é **obrigatório** no `craft`: é o que produz uma direção confirmada. Apresente a saída do `shape` e **pare** — espere o usuário confirmar, sobrescrever ou corrigir antes de escrever código. Briefing claro pode ter forma compacta (3–5 bullets + "confirma ou corrige"); só use o briefing estruturado longo em tasks genuinamente ambíguas.

### Passo 2 — Carregar referências de modo

Com base no briefing, consulte as refs relevantes. No mínimo, sempre: `references/layout.md` (grid, espaçamento, container queries, ajuste óptico) e `references/typeset.md` (hierarquia de tipo, fontes, OpenType). Some conforme a necessidade: `interaction-design`? consulte-o; animação → `animate.md`; cor/tema → `colorize.md`; responsivo → `adapt.md`; muito texto/labels/erros → `clarify.md`.

### Passo 3 — Direção visual

Feche a direção visual a partir do briefing (e de qualquer referência-âncora citada). Trate a direção aprovada como **contrato** de composição, hierarquia, densidade, atmosfera e movimentos visuais distintivos. Não substitua imagens obrigatórias (restaurante, hotel, revista, produto) por cards genéricos, ícones-placeholder, métricas falsas ou copy de enchimento. Verifique URLs de imagem antes de referenciar (palpite de ID vira placeholder quebrado).

### Passo 4 — Construir com qualidade de produção

Implemente em passes (estrutura → sistema visual → estados → motion/mídia → responsivo). A régua ("definition of done", não inspiração):
- **Conteúdo real** — sem copy/imagem/link/controle placeholder na entrega.
- **Semântica primeiro** — headings reais, landmarks, labels, associação de form, nomes acessíveis, anúncio de estado onde necessário.
- **Espaçamento e alinhamento deliberados** — nada de gaps default nem margens arbitrárias.
- **Tipografia intencional** — hierarquia clara, medida legível, quebras estáveis, sem overflow em nenhuma largura.
- **Cobertura de estados** — default, hover, focus-visible, active, disabled, loading, error, success, empty, overflow, texto longo/curto, primeiro uso.
- **Set de ícones coerente** — use o set do projeto; não misture.
- **Respeite o pipeline de build** — edite fonte e rode o build do projeto; nunca escreva em `dist/`/`build/`/`.next/` via `cat`/heredoc/redirect.
- **Motion premium** mas respeitando `prefers-reduced-motion`; evite animar propriedade de layout.
- **Tecnicamente limpo** — build passa, sem erro de console, sem layout shift evitável.

### Passo 5 — Iterar visualmente

Olhe o que você construiu como um designer. Seus olhos são o que o harness der: navegador conectado, screenshot, Playwright, ou perguntar ao usuário. Teste responsivo (mobile, tablet, desktop no mínimo) e valide seção a seção em superfícies longas (thumbnail esconde clipping/espaçamento). Se a ferramenta devolve um path de PNG, **leia o PNG de volta** na conversa — screenshot que você não leu não conta. Escreva uma crítica honesta contra o briefing, a direção aprovada e os DON'Ts (rode o modo `critique` para isso). Corrija defeitos materiais e re-inspecione. Não invente defeito para simular iteração.

### Passo 6 — Apresentar

Mostre a feature no estado primário, resuma os viewports checados e os fixes mais importantes, percorra os estados-chave (empty/error/responsivo), explique as decisões que amarram no briefing, registre desvios aceitos honestamente e pergunte: "O que está bom? O que não está?".

## Enforcement automático

Enquanto você edita, os linters de Standards rodam no `post-tool-use` sem hook novo: `std-design-antipatterns` (slop), `std-visual-quality` (legibilidade/layout estáticos) e `std-accessibility` (a11y). Eles barram os "AI tells" decidíveis por parsing estático — não são prova de que o trabalho está pronto, só evidência de defeito. Os princípios que exigem DOM renderizado/geometria/tokens ficam como guidance (ver `critique`/`audit`).
