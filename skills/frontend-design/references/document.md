# document — documentar o design system do projeto (tokens)

## Objetivo

Gerar/atualizar a documentação de design system do projeto — o `@.context/product/product-design-system.md` — como spec **legível por máquina e por humano**: tokens (cor, tipografia, espaçamento, raios, elevação, componentes) mais a prosa que dá o "porquê". É o que mantém os agentes de IA visualmente on-brand e o que as regras `design-system-*` (guidance) usam como fonte de verdade cross-file.

## Quando usar

- No `init`, quando o projeto tem tokens/código mas ainda não tem o doc de design system.
- Quando o design system existente ficou desatualizado (drift) e precisa recapturar o estado atual.
- Como baseline antes de um redesign grande.

Nunca sobrescreva um doc existente em silêncio — pergunte primeiro.

## Dois caminhos

- **Scan mode (default)** — o projeto já tem tokens/componentes/output renderizado. Extraia tokens do código e depois confirme a linguagem descritiva com o usuário.
- **Seed mode** — projeto pré-implementação. Entreviste o usuário por poucas respostas de alto nível e produza um scaffold mínimo marcado como semente, a resolver quando houver código.

Decida escaneando primeiro. Se o scan não achar tokens/componentes/site, ofereça o seed mode — não troque automaticamente.

## Passos (scan mode)

1. **Achar assets de design** — varra em ordem de prioridade: CSS custom properties (`--color-`, `--font-`, `--spacing-`), config do Tailwind (`theme.extend`), theme em CSS-in-JS, arquivos de token (`tokens.json`), biblioteca de componentes, stylesheet global, e por fim estilos computados do output renderizado.
2. **Auto-extrair tokens** — agrupe por tipo: cores (primary/secondary/neutral/surface com papéis), tipografia (display/headline/title/body/label), elevação (vocabulário de sombra ou estratégia flat/tonal), componentes (button/card/input/chip/nav com estados), espaçamento e raios.
3. **Coletar input qualitativo** — uma rodada de perguntas: north-star criativo (metáfora nomeada), voz do overview, nomes descritivos de cor ("teal-navy profundo", não "blue-800"), filosofia de elevação, "feel" dos componentes.
4. **Escrever o doc** — tokens na frente (normativos), prosa contextualizando, com seções fixas: Overview, Cores, Tipografia, Elevação, Componentes, Do's & Don'ts. Cite as **anti-references** do produto pelo nome nos Don'ts, para a linha estratégica chegar ao visual. Cor em **um** formato canônico (hex sRGB **ou** OKLCH — não misture).
5. **Confirmar e refinar** — mostre o doc, destaque as escolhas criativas, ofereça refino.

## Passos (seed mode)

1. Confirme o caminho seed (nenhum sistema visual existe ainda).
2. Cinco perguntas: estratégia de cor (restrita/comprometida/paleta cheia/imersiva + hue-âncora), direção tipográfica, energia de motion, três referências nomeadas (marcas/produtos/objetos, sem adjetivos), uma anti-reference.
3. Escreva o doc-semente com placeholders honestos; marque cor/tipografia como "a resolver na implementação".
4. Confirme e encoraje re-rodar depois que houver código.

## Regras guidance

Este modo **produz** a fonte que as regras de design system conferem depois. Ao documentar, deixe os tokens explícitos e semânticos para que estas regras (guidance — exigem comparação cross-file contra os tokens; ver `docs/design-rules-classification.md`) tenham contra o que comparar:
- **design-system-font** — fontes usadas no código devem bater com os tokens de tipografia documentados aqui.
- **design-system-color** — cores usadas devem sair da paleta documentada, não valores soltos.
- **design-system-radius** — raios usados devem sair da escala documentada.

Nomeie tokens por semântica (`--text-body`, `--text-heading`, `--space-md`), nunca por valor (`--font-16`) — token com nome de valor não sobrevive a mudança e derrota a conferência.
