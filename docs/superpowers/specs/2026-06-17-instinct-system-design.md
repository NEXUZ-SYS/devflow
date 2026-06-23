# Design — Instinct System (Continuous Learning) para o DevFlow

> **DevFlow workflow:** instinct-system | **Escala:** MEDIUM | **Fase:** P (Planning) → R
> **Branch:** `feature/instinct-system` (off `main`, estratégia branch-flow)
> **Data:** 2026-06-17 | **Idioma:** pt-BR
> **Origem:** adaptação do "Instinct system" (`continuous-learning-v2`) do projeto MIT `affaan-m/ECC`.

## Objetivo

Dar ao DevFlow um loop de aprendizado automático que observa a sessão, destila
comportamentos atômicos pontuados por confiança ("instincts") e os reinjeta em
sessões futuras — **sem virar um 4º silo de memória** ao lado de napkin,
MemPalace e auto-memory.

## Contexto e motivação

O loop de aprendizado atual do DevFlow é todo manual ou exige gatilho explícito:
`napkin` (runbook curado à mão), MemPalace (memória semântica via mining
invocado), auto-memory `MEMORY.md` (escrita manual). Não existe captura
*automática e de baixo atrito* de "esse comportamento funcionou / o usuário me
corrigiu", que acumula evidência e só promove quando passa de um limiar de
confiança. O Instinct system preenche exatamente essa lacuna.

O ganho mais forte no contexto do usuário (muitos projetos distintos: plugin
DevFlow, vários ERPs Odoo, NXZ, opensquad) é o **escopo por projeto com
promoção a global**, que evita contaminação cruzada (um padrão de Odoo-18 não
vaza para o plugin DevFlow).

## Fronteira do MVP

**Dentro:**
- Captura crua de observações via hook (append em JSONL).
- Motor de confiança Node zero-dep: instincts com `confidence` 0.3→0.9 + evidência.
- Escopo project-scoped (hash do git remote) + global, com promoção (≥2 projetos → global).
- Análise por LLM em fronteira de sessão (opt-in, profile-gated) + comando `/devflow instinct mine`.
- Recall: injeção dos instincts acima do limiar no `SessionStart` (bounded).
- Pontes de saída: ao confirmar (confiança alta/global), **propõe** napkin e/ou grava MemPalace.

**Fora (fase 2):** evolução automática instinct→skill/command/agent; clustering avançado; import/export entre máquinas.

## Decisões de design (e alternativas rejeitadas)

| # | Decisão | Alternativas rejeitadas | Por quê |
|---|---------|-------------------------|---------|
| 1 | **Store próprio leve + pontes** | drawer no MemPalace; direto no napkin | MemPalace é opcional (Full mode) → acoplar deixaria Lite/Minimal sem o sistema. napkin é curado/capado, não suporta acúmulo de confiança/volume. Store próprio tem papel distinto (observação crua → confiança) e *alimenta* os outros. |
| 2 | **XDG fora do repo, project-scoped** | `.context/instincts/` no repo; híbrido | Privacidade local-by-default (ADR-005). Observações crsuas capturam comandos/edições potencialmente sensíveis → nunca commitadas. |
| 3 | **Node zero-dep `.mjs`** | Python (como ECC/MemPalace) | Segue o precedente da lib do `adr-builder` (stdlib only, sem package.json). Não torna Python dep dura de uma feature core. |
| 4 | **Fronteira de sessão + comando** | só sob demanda; daemon/observer | Hooks são baratos (append). Análise LLM in-session evita daemon e custo de token fora de sessão (disciplina cost-gated da ADR-005). |

## Arquitetura — seis unidades

Cada unidade tem um propósito, interface bem definida, e é testável isoladamente.

**1. Captura de observações** *(estende `hooks/post-tool-use`, já `async`)*
Append-only em `observations.jsonl` por projeto. Sem LLM. Grava timestamp, tool,
alvo (redigido), desfecho. Gated por config + profile. Sem repo git → não captura.
- **Append e rotação sob o `withLock` existente** (`adr-update-index.mjs`, PID-liveness + stale recovery) — não inventa lock novo (I3).
- **Rotação atômica por byte-cap** (não por contagem de linhas): escreve `.tmp` com o tail, `rename()` por cima, tudo dentro do mesmo lock. O mining mantém um **checkpoint/offset de consumo** para a rotação nunca descartar observações não-mineradas.
- **Dois efeitos separados (I1):** (a) *append da observação* = efeito colateral puro, seguro em `async`; (b) *sugestão "atingiu N → rode mine"* = nudge **best-effort** (padrão do napkin nudge). O nudge NÃO é gatilho confiável — o gatilho primário é o comando `/devflow instinct mine` e o auto-mine in-session em autonomia ≥assisted.
- **Redação antes do append (N4):** roda na unidade 1, nunca no recall. Caveat: `≥9 dígitos` pode mutilar SHAs/timestamps/linhas em comandos git — usar allowlist de contexto (não redigir dentro de paths/SHAs) ou aceitar o tradeoff documentado.

**2. Instinct store** *(lib Node zero-dep `.mjs` — núcleo testável)*
Camada de dados pura + I/O. Resolve project-hash (git remote), file-locking,
matemática de confiança (criar/reforçar/decair), lógica de promoção. Não conhece
LLM nem hooks. Interface = funções puras + CLI.

**3. Análise/mining** *(skill LLM — fronteira de sessão + comando)*
Lê observações, infere instincts candidatos (1 trigger + 1 action), deduplica por
trigger normalizado, chama o store p/ criar/reforçar. Roda **in-session** (hooks
Bash não chamam LLM): o hook conta observações e injeta sugestão; o mining roda
via comando ou auto em autonomia ≥assisted.

**4. Recall/injeção** *(estende `hooks/session-start`, leitura pura)*
Lê um **índice pré-materializado** (`index.json` por escopo — project + global),
NÃO varre o diretório `instincts/*.md` (C2). O índice é mantido pelo store
(unidade 2) ao criar/reforçar, exatamente como `adr-update-index.mjs` materializa
o README. O `SessionStart` lê 2 JSONs + 1 sort, formata digest **bounded** e
injeta. **Time-budget hard** (não-bloqueante): se exceder ~50ms aborta e injeta
nada, herdando o invariante "ALWAYS exit 0 / nunca quebra a sessão"
(`post-merge-mempalace.sh`).

**5. Pontes de saída** *(elegibilidade no store + ação in-session — N1)*
A **decisão** "este instinct é elegível para ponte" (cruzou 0.8 / promovido) é
matemática de confiança e vive no store puro (unidade 2, testável sem mocks). A
**ação** (propor napkin / gravar MemPalace) é orquestração in-session. Ao agir:
o instinct é a **fonte canônica**; a ponte MemPalace grava uma **referência**
(id + trigger + action), não uma cópia paralela que diverge (I2). Reusa a
detecção de disponibilidade do MemPalace já existente nos hooks (não reimplementa).
Nunca escreve calado.

**6. Superfície CLI/comando**
`instinct-cli.mjs` (status/mine/promote/prune/list) + comando `/devflow instinct <sub>`
+ skill `devflow:instinct-ops` (espelha o split `memory-ops`/`memory-recall`).

**Fluxo:** hook→JSONL → análise lê JSONL → store (confiança) → SessionStart lê store → pontes propõem napkin/MemPalace.

## Modelo de dados

**Layout do store (XDG, project-scoped):**
```
~/.local/share/devflow-instincts/        # override: $DEVFLOW_INSTINCTS_DIR; respeita $XDG_DATA_HOME
  projects.json                           # registry: hash → {name, remote, last_seen, counts}
  projects/<hash>/
    observations.jsonl                    # observações crsuas (append-only, rotação por tail)
    instincts/<id>.md                     # 1 instinct por arquivo
  global/instincts/<id>.md                # instincts promovidos (≥2 projetos)
```

**Observação (linha JSONL) — bounded, redação na captura:**
```json
{"ts":"…","session":"…","tool":"Edit|Bash|Write|TaskUpdate","target":"<path/comando redigido>","outcome":"ok|error","signal":"<tag opcional>"}
```

**Instinct (frontmatter + corpo), em pt-BR:**
```yaml
---
id: prefer-rg-over-grep
trigger: "ao buscar conteúdo em arquivos"
action: "usar rg em vez de grep"
confidence: 0.7              # 0.3 tentativo → 0.9 quase-certo
domain: workflow             # code-style|testing|git|debugging|workflow|security
scope: project               # project|global
project_id: "<hash>"
project_name: "devflow"
source: session-observation
observations: 5
status: pending              # pending|active|archived
created: 2026-06-17
updated: 2026-06-17
---
## Evidência
- Observado 5x; usuário corrigiu grep→rg em 2026-06-…
```

**Modelo de confiança:**
- Novo instinct nasce **0.3**; reforço consistente **+0.1** (cap 0.9).
- **Correção do usuário (+0.2) só é atribuída pelo mining LLM (unidade 3), NUNCA pelo hook** (C1). Um hook Bash não vê a correção em linguagem natural; quem infere "o usuário corrigiu X→Y" é o LLM in-session, que tem o transcript. O hook só registra reforço por repetição de outcome.
- **Limiares:** `≥0.6` → elegível p/ recall; `≥0.8` → elegível p/ ponte.
- **status:** `pending` (<0.6) → `active` (≥0.6) → `archived` (manual/decaído).
- **TTL:** instinct `pending` com `confidence<0.3` há >30 dias é podado (`prune`).

**Identidade e promoção (I4):** a chave de identidade NÃO é normalização lexical do trigger (frágil em texto livre pt-BR). O **mining LLM faz o match semântico** contra instincts existentes e **reusa o `id` canônico** quando é o mesmo aprendizado; a normalização lexical é só um pré-filtro barato. Promoção: mesmo `id` canônico visto em **≥2 hashes de projeto distintos** (via `projects.json`) → copiado para `global/`, `scope: global`.

## Privacidade e opt-in (alinhado ADR-005)

- `enabled: false` por default — nova seção `instincts:` no `.devflow.yaml`.
- Profile-gating `DEVFLOW_INSTINCT_PROFILE=off|minimal|standard` (espelha `ECC_HOOK_PROFILE`).
- **Precedência explícita dos 3 toggles (N2):** opt-out por sessão (env) **>** `DEVFLOW_INSTINCT_PROFILE` (env) **>** `instincts.profile`/`instincts.enabled` (`.devflow.yaml`). `enabled:false` no YAML é o piso; qualquer env só restringe, nunca habilita o que o YAML desligou.
- Local-by-default: store XDG, nunca commitado; observações não saem da máquina.
- Redação na captura: nunca loga token/credencial; PII best-effort (email, IPv4, ≥9 dígitos — ver caveat N4).
- Opt-out por sessão via env. Sem repo git → sem captura.

## Configuração (`.devflow.yaml`)

```yaml
instincts:
  enabled: false             # opt-in (default off)
  profile: standard          # off | minimal | standard
  recall:
    minConfidence: 0.6
    maxChars: 2000           # digest bounded no SessionStart
  mine:
    minObservations: 20      # limiar p/ sugerir mining na fronteira
  bridges:
    napkin: propose          # off | propose
    mempalace: propose       # off | propose (só se MemPalace disponível)
```

## Estratégia de testes (TDD obrigatório)

Todo grupo de tarefas começa por teste falhando (RED→GREEN→REFACTOR). Testes reais, não content-checks.

- **Unit (`instinct-cli.mjs` + lib):** matemática de confiança (criar @0.3, reforçar +0.1/cap 0.9, correção +0.2), normalização de trigger p/ dedupe, resolução de project-hash, detecção de promoção (≥2 projetos), TTL/prune, redação de PII/credenciais. Node test runner (`node --test`), zero-dep.
- **Integração (hooks):** `post-tool-use` faz append correto e respeita `enabled:false`/profile; `session-start` injeta digest bounded e prioriza confiança; sem repo git → no-op. Fixtures em tmpdir (NUNCA mutar dirs versionados — usar cópia tmp).
- **E2E (fluxo completo):** observações → mine (mock do LLM/inferência) → store → recall → ponte propõe napkin/MemPalace. Em sandbox tmpdir destrutível.
- **Privacidade:** teste explícito de que token/credencial nunca aparece no JSONL nem no digest.

## Revisão do architect (Step 3) — achados incorporados

Veredito: **VIÁVEL** sem redesenho estrutural. Achados resolvidos no spec acima:
- **C1** (correção só pelo mining LLM) → modelo de confiança.
- **C2** (recall lê índice pré-materializado + time-budget) → unidade 4.
- **I1** (append async ≠ nudge best-effort) → unidade 1.
- **I2** (instinct canônico, ponte grava referência) → unidade 5.
- **I3** (`withLock` + rotação atômica tmp+rename + checkpoint) → unidade 1.
- **I4** (identidade via match semântico no mining) → identidade/promoção.
- **N1** (elegibilidade no store, ação in-session) → unidade 5.
- **N2** (precedência dos toggles) → privacidade/opt-in.
- **N4** (ordem/caveat da redação) → unidade 1.

**Arquivos-precedente que o plano DEVE referenciar:**
- `scripts/adr-update-index.mjs` — `withLock` (PID-liveness, ~L71-119) p/ append/rotação; padrão de índice materializado p/ o recall.
- `scripts/adr-audit.mjs` — precedente de lib zero-dep `.mjs` (unidade 2).
- `hooks/post-tool-use` — napkin nudge (padrão do nudge de mine); detecção MemPalace a reusar; canal `additionalContext`.
- `hooks/session-start` — detecção MemPalace; padrão `2>/dev/null || true` p/ recall não-bloqueante.
- `scripts/post-merge-mempalace.sh` — invariante "ALWAYS exit 0".

## Oportunidade de ADR (Step 3.5)

**Confirmado pelo architect (N3):** a decisão **estende** a ADR-005 (mesma família —
telemetria/observação local, opt-in, `enabled:false`, redação PII, lazy-load). NÃO
contradiz. Ação recomendada: `adr:evolve` (minor) na ADR-005 adicionando o instinct
store como segundo consumidor da disciplina — evita duplicar guardrails de privacidade.
