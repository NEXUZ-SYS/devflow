# Spec — Integração do impeccable ao DevFlow (design de front-end para agentes)

> **Workflow DevFlow:** `integrate-impeccable-design-guide` · **Escala:** LARGE · **Fase:** P → R
> **Modo:** Full · **Autonomia:** supervised · **Data:** 2026-07-02 · **Status:** Aprovado (design) — aguardando plano

## 1. Contexto e problema

[pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0, autor Paul Bakaus) é um "guia de design para agentes de codificação de IA": **1 skill, 23 comandos, iteração ao vivo no navegador e 45 regras determinísticas de detecção** de anti-padrões de front-end gerado por IA. Resolve a "monocultura" visual que agentes tendem a produzir (gradient text, glassmorphism default, grids de cards idênticos, eyebrow kickers etc. — a categoria `slop`) e cobre também legibilidade/a11y (`quality`).

Queremos **ativar esse valor dentro do DevFlow "da forma correta"**: integrado aos **Standards** (regra determinística = linter, ADR-002) e ao **knowledge de negócio** (`/devflow:knowledge` — design-system, tom de voz, ICP), **sem conflitar** com o que o DevFlow já tem no espaço de front-end.

**Superfície local relevante (levantada na fase P):**
- Não existe skill de design/front-end genérica. A única skill de front-end é `skills/frontend-specialist-odoo/` (100% Odoo). O `agents/frontend-specialist.md` é um *executor* de UI (fase E), não um guia de design.
- `agents/product-context.md:53` **já delega explicitamente** "detalhes de implementação à skill de design-system do projeto" — a costura de integração já existe conceitualmente.
- A taxonomy de knowledge já tem o tipo `product-design-system` (camada product, `activation: always`, owner `product-context`, seções UX/Tokens/Acessibilidade).
- Standards default incluem `std-accessibility` (WCAG 2.2 AA, `applyTo` tsx/jsx, linter bundled) — **há sobreposição de a11y** a evitar.
- Os linters default disparam pelo `hooks/post-tool-use` existente (via `scripts/lib/run-linter-cli.mjs`) — **não precisa de hook novo**.

## 2. Objetivos e não-objetivos

**Objetivos (v1):**
1. Enforcement determinístico das 45 regras do impeccable como **Standards nativos** do DevFlow (linters bundled).
2. Uma **skill de guidance de design** (`frontend-design`) que expõe os 23 comandos como modos e **consome o knowledge de negócio** para grounding.
3. **Inicialização** do subsistema plugada no `/devflow init` e ativável em projetos existentes via `/devflow update` — **dirigida por auto-detecção de front-end**.
4. Capacidade **`live`** (iteração no navegador) via **bridge** para `npx impeccable live`, reconciliada com os guardrails de git.
5. Coexistência/migração para projetos que já instalaram o impeccable cru.

**Não-objetivos (v1):**
- Re-portar **nativo** o runtime do `live` (server local + SSE + HMR + patch de CSP). Fica como *hardening* futuro; v1 usa bridge.
- **Reconstruir** a extensão Chrome. Ela é canal próprio (Web Store); apenas documentamos a instalação standalone.
- Suportar todos os 11 harnesses do impeccable. Alvo do DevFlow = Claude Code (+ compat omp/OpenCode já existente do DevFlow).

## 3. Decisões de design (travadas no brainstorming)

| # | Decisão | Escolha |
|---|---------|---------|
| **D1** | Estratégia de integração | **Híbrido** — absorve a parte determinística como Standards nativos; reaproveita a *guidance* do impeccable (Apache-2.0, atribuída) numa skill DevFlow; `live`/extensão como add-on. |
| **D2** | Distribuição dos Standards | **Default bundled + gated por front-end** (igual `std-accessibility`), `applyTo` restrito a globs front-end → inerte em backend-only. |
| **D3** | Escopo v1 | **Tudo** — regras + skill + `live` (via bridge) + extensão (doc). Node≥24 aceito (só exigido se usar `live`). |
| **D4** | Ativação | **Default-on dirigida por auto-detecção de front-end.** Escritas anunciadas; reconciliações destrutivas com consentimento. |
| **D5** | Entrega do `live` (dep externa) | **`npx impeccable@<pinned> live` efêmero** — fetch sob consentimento, sem install global; evita o `npx impeccable install` oficial (que religa o hook do impeccable). |

## 4. Arquitetura

```
DETERMINÍSTICO ── Standards (ADR-002 / ADR-007)
  std-design-antipatterns.md   → regras "slop" (cara de IA), warn/advisory
  std-visual-quality.md        → legibilidade/tipografia/layout ("quality")
  machine/std-design-*.js      → 45 regras portadas (adapter jsdom), bundled-only
  a11y ESTÁTICO (aprovado na classificação A0) → DELEGADO ao std-accessibility
      (applyTo ampliado p/ css/html; `alt` já coberto — não reintroduz;
       a11y não-estático → guidance na skill)
  concern 'design' → taxonomy do plugin (entries:), como accessibility/i18n
  dispara no hooks/post-tool-use EXISTENTE (run-linter-cli) — sem hook novo

GUIDANCE ── skills/frontend-design/SKILL.md
  23 modos (craft/shape/critique/audit/polish/bolder/quieter/animate/…)
  corpo adaptado do impeccable (Apache-2.0, atribuído em NOTICE)
  CONSOME knowledge: @.context/product/product-design-system.md
                     @.context/product/product-tone-of-voice.md
                     @.context/business/business-icp.md
  gating anti-conflito: invocação explícita + delegada por product-context

KNOWLEDGE WIRING ── agents/product-context.md aponta a delegação → frontend-design
  se docs não existem no projeto, a skill oferece criá-los via /devflow:knowledge

INICIALIZAÇÃO ── modo `frontend-design init` (register brand/product + knowledge +
  waivers/opt-out + concern), plugado no devflow:project-init + post-update-guide

LIVE (bridge, v1) ── modo `live` → adaptador fino nativo (SEM marcador):
  1) hard-gate: recusa em branch protegida; em feature branch o hook já permite
  2) valida Node≥24 + versão + integridade sha512; consentimento por-invocação
  3) invoca `npx impeccable@<pinned> live`   (pre-tool-use INALTERADO)

EXTENSÃO ── doc "instalar standalone" (Chrome Web Store); não reconstruída
COMANDO ── commands/devflow-design.md → /devflow:design roteia os 23 modos
```

## 5. Componentes

### 5.1 Standards (núcleo determinístico)
- **Fonte upstream:** `cli/engine/registry/antipatterns.mjs` (45 IDs) + `cli/engine/rules/checks.mjs` (6 funções) + adapter `cli/engine/detect-antipatterns.mjs` (jsdom).
- **Porte:** cada regra vira uma checagem no contrato de linter DevFlow (recebe `filePath` em `argv[2]`, emite `VIOLATION: <msg>`, `process.exit(1)`), rodando via **jsdom** (não o adapter browser). Parsing estático via `css-tree`/`htmlparser2`/`css-select` (mesmas deps do detector; sem LLM/rede).
- **Decidibilidade estática primeiro (Revisão R):** só vira **linter** a regra decidível por parsing estático de **um arquivo**. As que exigem DOM renderizado (`getComputedStyle`), estado cross-file ou tokens do projeto (`low-contrast`, `gray-on-color`, `tiny-text`, `skipped-heading`, `tight-leading`, `layout-transition`, `text-overflow`, `clipped-overflow-container`, `design-system-*`) viram **guidance** na skill — não linter falso. A classificação (Task A0 do plano) precede o port.
- **Divisão dos `std-*`:**
  - `std-design-antipatterns.md` → regras `slop` estáticas. Shipadas **warn/advisory** por serem opinativas.
  - `std-visual-quality.md` → regras `quality` **estáticas** de legibilidade/tipografia/layout. Referencia o `std-accessibility` na seção de escopo (a11y mora lá).
- **Delegação de a11y (escopo corrigido):** as regras a11y **estáticas** que A0 aprovar entram no `std-accessibility` — que hoje é **tsx/jsx-only**; se aplicarem a `.css`/`.html`, o `applyTo`+guard do `std-accessibility` é **ampliado** (senão ficam inertes). `alt` **já é coberto** pelo `std-accessibility` atual → não reintroduzir. As a11y não-estáticas viram guidance.
- **Concern:** registrado na **taxonomy do plugin** (`skills/standards-builder/references/taxonomy-of-concerns.yaml`, chave `entries:`) como os defaults `accessibility`/`internationalization` — pois os `std-design-*` são **defaults bundled**. (`concerns.local.yaml` é só o caminho **per-projeto/runtime** para stds de design customizados — a "hard rule" de não editar a taxonomy vale para runtime, não para o desenvolvimento do próprio plugin.)
- **Distribuição (D2):** `assets/standards/std-design-*.md` + entradas no `assets/standards/MANIFEST.txt`; `.md` publicados também no repo standalone **`NEXUZ-SYS/devflow-standards`** (`.context/engineering/standards/`) no mesmo release; `.js` **bundled-only** (ADR-007, anti-RCE); `applyTo: ['**/*.{tsx,jsx,vue,svelte,html,css}']`.

### 5.2 Skill `frontend-design` (guidance)
- Nome evita colisão com `frontend-specialist-odoo`. Diretório `skills/frontend-design/` com `SKILL.md` + `references/<cmd>.md` (adaptados de `skill/reference/*` do impeccable).
- **23 modos** agrupados como no upstream: Build (craft/shape/init/document/extract), Evaluate (critique/audit), Refine (polish/bolder/quieter/distill/harden/onboard), Enhance (animate/colorize/typeset/layout/delight/overdrive), Fix (clarify/optimize/adapt), Iterate (live).
- **Gating anti-conflito:** `description` com fronteira explícita — a skill atende design/redesign/critique/audit **quando invocada** (via `/devflow:design <modo>` ou delegação de `product-context`); **não** intercepta prompts genéricos de UI (que continuam com o `frontend-specialist`).
- **Grounding obrigatório:** antes de qualquer modo, lê o knowledge (`product-design-system`, `product-tone-of-voice`, `business-icp`) via `@.context/...`. **Não duplica** conteúdo.

### 5.3 Knowledge wiring
- Atualiza `agents/product-context.md` para nomear `frontend-design` como a "skill de design-system do projeto" já prevista em `:53`.
- Se os docs de knowledge não existem, a skill **oferece criá-los** via `/devflow:knowledge` (tipos `product-design-system`, `product-tone-of-voice`, `product-persona`/`business-icp`).

### 5.4 Inicialização (bootstrap por projeto — Componente novo)
Modo `frontend-design init` (reaproveita o `init` dos 23):
1. detecta front-end + **register** (`brand` vs `product`) → grava `design.register` em `.context/.devflow.yaml`;
2. **scaffolda/linka** os docs de knowledge consumidos (via `/devflow:knowledge`), se faltarem;
3. semeia a seção *Tokens* (paleta OKLCH) do `product-design-system.md`;
4. estabelece **waiver único** (Standards) + **opt-out** por projeto (ex.: manter `quality`, desligar `slop`);
5. registra o concern `design`.

**Mapa impeccable-init → DevFlow-native:** `context.mjs`→detecção no init; register `brand/product`→`design.register`; `DESIGN.md`→`product-design-system.md`; `PRODUCT.md`→`product-vision/persona`+`business-icp`; paleta→seção Tokens; `.impeccable/config.json`→waiver de Standards.

### 5.5 Ativação/migração em projetos existentes (brownfield — Componente novo)
**Duas camadas:**
- **Automática (via `/devflow update` + restart):** linters (defaults bundled → enforcement começa automático), skill, comando e `product-context` atualizado chegam pelo update do plugin. **Nada por projeto** para o enforcement.
- **Por projeto (uma vez):** `/devflow:design init` — oferecido pelo próprio update quando **front-end && não-ativo** (detecção no `references/post-update-guide.md`).

**Propriedades:** é **aditivo** (não é migração de layout como v1→v2 DDC); **idempotente**; **provenance-aware** (std novos = "intocados" → auto-atualizam; editados → preservados).

**Reconciliação `--from-impeccable`:** se o projeto já tem o impeccable cru (`.claude/skills/impeccable/`, hook no `settings.json`, `.impeccable/config.json`), o init **detecta e oferece** (consent-gated): desligar o PostToolUse do impeccable (evita findings/waivers duplos), **importar** os waivers de `.impeccable/config.json` + comentários `impeccable-disable` para o sistema de Standards, e aposentar a skill `impeccable` em favor de `frontend-design`.

### 5.6 Live (bridge, v1) — redesenho da Revisão R
Adaptador fino nativo, **sem marcador no `pre-tool-use`** (o `hooks/pre-tool-use` fica **inalterado**). `live` é **hard-gate de feature branch**: (1) se a branch atual é protegida → **recusa** com instrução para criar feature branch; em feature branch o `pre-tool-use` **já permite** as edições in-place que o `live` gera — não há bypass a introduzir; (2) valida **Node≥24 + versão + integridade sha512** do CLI (ver §5.8); (3) **consentimento por-invocação** exibindo comando+versão+hash; (4) só então invoca `npx impeccable@<pinned> live`. Re-port nativo do runtime = fora do v1. **Motivo do redesenho (R):** um marcador de sessão só teria efeito em branch protegida (onde o gate deve barrar) e `.context/runtime/` é forjável — os dois revisores classificaram como enfraquecimento do branch-protection.

### 5.7 Extensão + atribuição
- **Extensão Chrome:** não reconstruída; doc "como instalar standalone".
- **Atribuição:** `NOTICE` na raiz do que for derivado (linters portados + corpo da skill) creditando `pbakaus/impeccable` (Apache-2.0) e a "Anthropic frontend-design skill" citada pelo upstream. Preserva cabeçalhos de licença.

### 5.8 Ciclo de vida da dependência externa (impeccable CLI)
**Escopo do acoplamento:** o CLI/detector do impeccable é dependência **apenas do modo `live`**. Regras (Standards) e guidance (skill) são portadas nativas → **zero dependência de runtime** do impeccable para o núcleo. Não há "versão instalada" a validar no enforcement nem na guidance — só no `live`.

**Versão + integridade fixadas (Revisão R):** o bridge fixa versão **e hash de integridade sha512** (`npm view impeccable@<pinned> dist.integrity`), controlando o contrato (upstream é BETA/movente) e mitigando account-takeover/republish. Pin de versão sozinho é insuficiente. Ambos citados no `NOTICE`; o bridge **verifica o integrity antes de rodar**. `live` executa código de terceiros **fora do TCB** do DevFlow — nada que ele produz herda a confiança do núcleo.

**Mecanismo (D5):** `npx impeccable@<pinned> live` **efêmero**, sob consentimento — **não** usa install global nem o `npx impeccable install` oficial (que mesclaria em `settings.json` e religaria o hook do impeccable).

**Invariante DevFlow (consistência com as outras libs):** **nunca auto-instala** dependência externa; **guard por presença**; ausente/offline = **no-op limpo**; **surface o comando**. Mesmo idioma de `dotcontext` (update Step 4: `command -v … && npm update`), MemPalace (4b: upgrade-se-presente + warn legado), skills externas/napkin (4c: refresh-se-existe, nunca auto-instala) e features (Step 6: detecta + expõe ativação).

**Aplicação (3 touchpoints):**
1. **`/devflow update` (guarded, estilo Step 4):** se o projeto é front-end **e** `live` foi optado, valida `impeccable --version` vs pinned e propõe update **só se presente**. **Nunca auto-instala.** Ausente/offline = no-op.
2. **post-update-guide (Step 6):** front-end detectado **e** CLI ausente → entrada `▸ Iteração ao vivo (live) — requer impeccable CLI + Node≥24. Para ativar: /devflow:design live` (com o comando de instalação).
3. **Runtime do bridge (`/devflow:design live`):** valida (a) **hard-gate de feature branch** (recusa em branch protegida), (b) Node≥24, (c) presença + versão ≥ pinned **+ integridade sha512**. Se faltar/desatualizar/divergir → **propõe o comando exato e pede consentimento por-invocação exibindo comando+versão+hash** (fetch de rede + execução de terceiros → consent-gated), então prossegue. **Não** roda `npx` silenciosamente; **não** usa marcador que afrouxe o `pre-tool-use`.

## 6. Auto-detecção de front-end (mecanismo do D4)
- **Sinais:** deps em `package.json` (react, vue, svelte, @sveltejs/kit, next, astro, solid, preact, lit, angular) **ou** presença de arquivos `**/*.{tsx,jsx,vue,svelte}`.
- **Enforcement:** totalmente automático e seguro — os linters têm `applyTo` front-end, logo são **inertes** em repo backend-only (não precisa de detecção para "desligar").
- **Bootstrap (escreve arquivos):** dispara **default-on** quando front-end é detectado no `init`/`update`, mas **anuncia** o que vai criar (confirm leve único), sem gate "você quer design?".
- **Reconciliações destrutivas** (desligar hook do impeccable, editar `settings.json`): **sempre** consent-gated.

## 7. Estratégia de testes (TDD — obrigatório)
- **Linters (unit):** cada uma das 45 regras nasce de um teste **RED** com fixtures **positivo (viola)** e **negativo (não-viola)** antes da implementação. Cobertura 1:1. Rodados no sandbox SI-4 (`scripts/lib/run-linter.mjs`).
- **Skill (doc-test):** roteamento dos 23 modos + asserção de que o grounding lê o knowledge; audit de fronteira do `description` (não captura prompts genéricos).
- **Init/brownfield (integração):** detecção front-end, escrita de `design.register`, scaffold de knowledge, idempotência, e reconciliação `--from-impeccable` com `.impeccable/config.json` de fixture.
- **Bridge live (smoke):** guard de branch + gate de Node + reconciliação de hook, com `npx` mockado.
- **E2E:** ativação num sandbox de projeto front-end (cópia tmpdir — nunca in-place em dir versionado).

## 8. Faseamento do v1
1. Concern `design` + 2 `std-*` + 45 linters portados (TDD) + MANIFEST + publicação no standalone.
2. Skill `frontend-design` (23 modos + knowledge) + `commands/devflow-design.md`.
3. Knowledge wiring (`product-context`) + fallback de criação.
4. Inicialização: modo `frontend-design init` + Step de detecção/oferta no `devflow:project-init`.
5. Brownfield: entrada no `post-update-guide` + `/devflow:design init` + reconciliação `--from-impeccable`.
6. Bridge `live` + reconciliação com git-guardrails + **ciclo de vida da dep externa** (validação de versão/Node, guarded update, propor-instalação-com-consentimento — §5.8).
7. Doc da extensão + `NOTICE` de atribuição.

## 9. Riscos e mitigações
| Risco | Mitigação |
|-------|-----------|
| `live` × hooks de git (edição in-place barrada) | Adaptador sinaliza a sessão ao `pre-tool-use`. Se ficar frágil, `live` desce p/ fase 2 sem afetar 1–5. |
| Sobreposição com `std-accessibility` (findings/waivers duplos) | Delegação explícita: mapear as regras a11y e removê-las do nosso set; `std-visual-quality` referencia o `std-accessibility`. |
| Reversão/divergência de std no `update` (Step 4d) | Publicar `.md` no standalone + MANIFEST no **mesmo release**; `.js` bundled-only. |
| Trigger-space da skill competir com prompts genéricos | `description` com fronteira; ativação por invocação/delegação, não catch-all. |
| Drift do detector upstream (regras mudam) | Como portamos, o re-sync é manual; documentar procedimento de re-sync + fixar a versão-fonte no `NOTICE`. |

## 10. ADR a registrar
Contém decisões arquiteturais: (a) "detecção de design como Standards nativos (absorção) em vez de vendorizar o impeccable"; (b) "`live` via bridge ao invés de re-port nativo no v1". Rodar o **check de oportunidade de ADR** (prevc-planning Step 3.5) antes do plano; provável CREATE de 1 ADR nova, relacionada a ADR-002 (extends) e ADR-006 (aligned).

## 11. Conformidade com guardrails
- **ADR-002** (3 camadas de Standards): regra determinística = linter executável. ✔ (extends)
- **ADR-006** (knowledge DDC): a skill **consome** `product-design-system`, não duplica. ✔ (aligned)
- **ADR-007 v2.2.0** (default standards): `.md` no standalone, **`.js` bundled-only**. ✔
- **ADR-009** (doc-grounding): não afeta — o detector é local/determinístico, sem fatos de lib externa.
- **Versionamento pipeline:** **não** editar `plugin.json`/`marketplace.json`/`.cursor-plugin` manualmente; bump só via `release.yml`.
- **Licença:** Apache-2.0 preservada com `NOTICE`/atribuição.

## 11.5 Endurecimento de segurança (Revisão R)

Achados dos revisores (architect + security) incorporados ao design/plano:
- **`live` sem marcador** — hard-gate de feature branch, `pre-tool-use` inalterado; pin de **integridade** sha512 + consentimento por-invocação; execução de terceiros declarada **fora do TCB** (§5.6, §5.8).
- **jsdom seguro** — nunca `runScripts: "dangerously"`/`resources: "usable"`; teste de não-execução (fixture com `<script>`/`onerror` → zero exec/fetch).
- **Linter puro** — teste estático rejeita `eval`/`Function`/`child_process`/`fetch`/`http` nos `.js`.
- **`reconcile` seguro** — edição **cirúrgica** de `settings.json` (backup + revalida, preserva outros hooks); rule-ids importados **validados contra allowlist**; config malformado tratado.
- **Input não-confiável** — `detect-frontend`/`importWaivers` com `JSON.parse` em try/catch; glob sem seguir symlink, excluindo `node_modules`/`.git`.
- **Supply-chain** — deps de parsing (`jsdom`/`css-tree`/`htmlparser2`/`css-select`) pinadas + `npm audit`; `impeccable` **nunca** em `dependencies` (só `npx` efêmero consentido).
- **`.gitignore`** — `.context/runtime/` e `scripts/design/.pinned-version` não-versionáveis.
- **Correção de contrato** — concern na chave real `entries:` da taxonomy (não `concerns:`); frontmatter dos std espelha os defaults; `known-hashes` acumula (não substitui) o hash antigo do `std-accessibility`.

**Bug corrigido (crítico):** o plano original registrava o concern sob `concerns:` (chave inexistente; loader lê `entries:`) e portava as 45 regras às cegas (parte exige DOM renderizado). Ambos endereçados (Task A0 + A1 reescrita).

## 12. Referências
**Upstream (pbakaus/impeccable):** `skill/SKILL.src.md`, `skill/reference/*.md`, `cli/engine/registry/antipatterns.mjs`, `cli/engine/rules/checks.mjs`, `cli/engine/detect-antipatterns.mjs`, `skill/reference/live.md`, `LICENSE` (Apache-2.0).
**Local (DevFlow):** `assets/standards/MANIFEST.txt`, `assets/standards/machine/std-accessibility.js`, `.context/engineering/standards/README.md`, `skills/standards-builder/`, `skills/knowledge/references/taxonomy-of-knowledge.yaml`, `agents/product-context.md`, `agents/frontend-specialist.md`, `skills/project-init/`, `hooks/hooks.json`, `hooks/post-tool-use`, `references/post-update-guide.md`, `.context/engineering/adrs/` (002, 006, 007, 009).
