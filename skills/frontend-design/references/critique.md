# critique — revisão de design (heurística + detector)

## Objetivo

Rodar uma crítica de design honesta: duas avaliações **isoladas** — uma revisão de design (heurísticas de usabilidade) e uma varredura de detector (anti-patterns) — sintetizar os achados, persistir um snapshot e fazer perguntas direcionadas. É o modo "olhar como um designer olharia" e dizer o que está errado com evidência, não com opinião vaga.

## Quando usar

- Para avaliar uma UI existente antes de decidir o que refinar.
- No `craft` (Passo 5), como a crítica honesta contra o briefing e os DON'Ts.
- Quando o usuário pede "critique este design" / "o que está ruim aqui?".

## Grounding

Leia `@.context/product/product-design-system.md` (tokens/princípios), `@.context/product/product-tone-of-voice.md` (voz) e `@.context/business/business-icp.md` (persona/JTBD) — a crítica é contra a régua do **negócio**, não contra um gosto genérico.

## Passos

1. **Duas avaliações isoladas.** Avaliação A (revisão de design por heurísticas de usabilidade) e Avaliação B (detector de anti-patterns) devem rodar como duas passagens independentes. A saída do detector é **obrigatória** — pular é run falho. Alvos visualizáveis exigem inspeção no navegador quando disponível; se algo degradou (sem browser, sem sub-agente), marque com um banner de aviso, não finja.
2. **Inspeção renderizada.** Se há como ver (browser conectado, screenshot, Playwright), veja. Leia o PNG de volta na conversa — screenshot não-lido não conta. Superfícies longas: inspecione seção a seção.
3. **Sintetizar o relatório.** Tabela de heurísticas (scores tipo Nielsen), veredito de anti-patterns, issues priorizadas com tag **P0–P3**, red flags de persona (2–3 arquétipos relevantes do ICP), observações menores.
4. **Persistir snapshot.** Grave um snapshot estruturado da crítica (alvo, score total, contagem de P0/P1) e leia a tendência das últimas execuções para dar contexto ("melhorou desde a última?").
5. **Perguntar.** 2–4 perguntas **atreladas aos achados reais** (não genéricas), com opções concretas. Pule se os achados forem diretos.
6. **Recomendar.** Aponte os próximos modos ordenados por prioridade, mapeados às issues (ex.: contraste ruim → `colorize`; hierarquia fraca → `typeset`/`layout`; drift de token → `polish`).

## Enforcement automático (o que já é barrado)

Os "AI tells" decidíveis por parsing estático já são pegos pelos linters no `post-tool-use`: `std-design-antipatterns` (slop), `std-visual-quality` (legibilidade/layout estáticos) e `std-accessibility`. Output de linter/detector é **evidência de defeito**, nunca prova de que o trabalho está pronto. Não invente comandos `npx` — a detecção é os Standards.

## Regras guidance

Os linters só pegam o que é decidível por arquivo. A crítica é onde entram os princípios que exigem **DOM renderizado / estilo computado / geometria / cross-file / tokens** (todos `guidance` — ver `docs/design-rules-classification.md`). Verifique ativamente, na UI renderizada:

**Contraste & cor**
- **low-contrast** — texto sobre o fundo efetivo (resolvido pela cascade/ancestrais) com contraste real ≥ 4.5:1 (corpo) / 3:1 (texto grande/UI).
- **gray-on-color** — sem texto cinza sobre fundo colorido (fica lavado; use um tom mais escuro do próprio fundo ou transparência).
- **dark-glow** — sem glow "AI" (fundo escuro + sombra colorida difusa) como decoração.

**Legibilidade renderizada**
- **line-length** — medida de fato renderizada ~65–75ch (largura do rect ÷ font-size).
- **tight-leading** — line-height confortável (corpo ~1.5–1.7); nada apertado demais.
- **cramped-padding** — padding proporcional ao tamanho de fonte renderizado.
- **text-overflow** / **clipped-overflow-container** — sem overflow/clip cortando conteúdo (scrollWidth vs clientWidth; overflow computado).
- **body-text-viewport-edge** — texto de corpo não encostando na borda do viewport.

**Hierarquia**
- **skipped-heading** (cross-file) — na página **montada** (não só no componente): um `<h1>`, sem pular níveis de heading.
- **oversized-h1** — h1 não desproporcionalmente grande vs. o viewport.

**Composição**
- **nested-cards** — sem card-dentro-de-card sem propósito (use espaçamento/divisores).
- **icon-tile-stack** — sem pilha de tiles de ícone genéricos.
- **hero-eyebrow-chip** — sem eyebrow-chip ritualístico antes de todo hero.
- **repeated-section-kickers** — sem "kickers" repetidos com o mesmo estilo antes de cada heading.

**Design system**
- **design-system-font / -color / -radius** — fonte/cor/raio conferidos contra os **tokens** do `product-design-system` (coerência cross-file), não valores soltos.
