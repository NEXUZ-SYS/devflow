# init — bootstrap do subsistema de design no projeto

## Objetivo

Estabelecer o subsistema de design do DevFlow **por projeto**: detectar o front-end, registrar o tipo de superfície (`design.register`) no `.context/.devflow.yaml`, garantir o knowledge de negócio que serve de grounding, semear tokens quando fizer sentido, e configurar waivers/opt-out. É a etapa única de setup — depois dela, os demais modos (`craft`, `critique`, `polish`, `live`…) têm de onde partir.

## Quando usar

- Primeira vez que se usa `/devflow:design` num projeto (o subsistema ainda não foi registrado).
- Ao (re)configurar o registro de design de um projeto existente.
- Como preparação antes de `--from-impeccable` (reconciliação de um projeto que já usava o toolkit upstream).

## Passos

### Passo 1 — Detectar o front-end (determinístico)

Rode `scripts/design/detect-frontend.mjs` (o mecanismo de detecção; script entregue nas fases D/E). Ele varre o projeto e classifica a superfície: framework (Astro/Next/Nuxt/SvelteKit/Vite/HTML puro), presença de design system/tokens (`tokens.css`, `theme.ts`, Tailwind config), set de ícones e sinais de marca vs. produto. A saída é uma **hipótese de register** — `brand` (superfície de marca: landing, site institucional, marketing) ou `product` (UI de trabalho: dashboard, admin, settings, tabelas, superfícies autenticadas). Não confirme em silêncio: apresente a hipótese e deixe o usuário confirmar ou corrigir.

### Passo 2 — Gravar `design.register` no `.context/.devflow.yaml`

Persista o register confirmado sob a chave `design.register` no `.context/.devflow.yaml` (junto de metadados como framework detectado, path do design system e opt-out/waivers). Esse registro é o que os outros modos leem para saber se otimizam para **densidade/consistência** (`product`) ou **atmosfera/distinção** (`brand`). Nunca sobrescreva um register existente sem confirmação.

### Passo 3 — Scaffold do knowledge (grounding)

O design se ancora no knowledge de negócio, não em suposição. Para cada doc de grounding ausente, ofereça criá-lo via `/devflow:knowledge` (mecanismo canônico do DevFlow — não invente um comando de scaffold próprio):
- tipo `product-design-system` → `@.context/product/product-design-system.md` (princípios de UX/visual + **tokens**: paleta, tipografia, espaçamento, raios). É o equivalente DevFlow do `DESIGN.md`+`PRODUCT.md` do upstream.
- tipo `product-tone-of-voice` → `@.context/product/product-tone-of-voice.md` (voz/vocabulário para copy e erros).
- tipo `business-icp` → `@.context/business/business-icp.md` (para quem é).

Pelo menos uma rodada de respostas reais do usuário deve preceder o rascunho — modo entrevista, não modo aprovar-inferência-em-bloco.

### Passo 4 — Semear tokens

Se o projeto já tem tokens no código, o modo `document` os extrai para o `product-design-system`. Se é pré-implementação, ofereça semear um conjunto mínimo de tokens (paleta OKLCH restrita, escala 4pt de espaçamento, escala tipográfica modular, raios) marcado como semente, a resolver quando houver código. Tokens são a fonte de coerência cross-file que as regras `design-system-*` (guidance) conferem.

### Passo 5 — Waivers / opt-out

Configure o opt-out: um projeto pode marcar que **não** quer o subsistema de design (ex.: back-end puro, CLI) — registre isso no `.devflow.yaml` para os modos não se ativarem à toa. Waivers pontuais (silenciar uma regra específica num arquivo) usam **o sistema único de waiver dos Standards** — esta skill não cria um segundo sistema.

### Passo 6 — `--from-impeccable` (reconciliação consent-gated)

Se o projeto já usava o toolkit upstream (tem `DESIGN.md`/`PRODUCT.md`/`.impeccable/`), rode `init --from-impeccable`: o mecanismo `scripts/design/reconcile-impeccable.mjs` (entregue nas fases D/E) lê esses artefatos e propõe a migração para o layout DevFlow (`DESIGN.md`+`PRODUCT.md` → `product-design-system.md`; anti-references → `Do's/Don'ts`; register upstream → `design.register`). A reconciliação é **consent-gated**: apresenta o diff e só grava com aprovação explícita — nunca converte em silêncio.

### Passo 7 — Resumir e recomendar próximos passos

Resuma o que foi gravado (register, docs de knowledge criados, tokens semeados) e recomende 2–4 próximos modos com base nas observações da varredura (ex.: `craft` se há feature a construir, `document` se há tokens a extrair, `critique` se há UI existente a avaliar, `live` se há dev server).

## Nota

Os scripts `scripts/design/detect-frontend.mjs` e `scripts/design/reconcile-impeccable.mjs` são o **mecanismo** descrito aqui; são criados nas fases D/E do plano. Não invente comandos `npx`/externos — a detecção é determinística e a reconciliação passa por consentimento.
