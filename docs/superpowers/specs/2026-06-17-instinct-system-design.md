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
Lê instincts `active` (`confidence ≥ 0.6`, project + global), formata digest
**bounded** e injeta no contexto. Prioriza maior confiança ao exceder o cap.

**5. Pontes de saída** *(no fluxo de mine/promote, supervisionado)*
Ao cruzar `confidence ≥ 0.8` ou promover a global: **propõe** entrada no napkin
e/ou grava memória no MemPalace (quando disponível). Nunca escreve calado.

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
- Novo instinct nasce **0.3**; reforço consistente **+0.1** (cap 0.9); correção explícita do usuário **+0.2**.
- **Limiares:** `≥0.6` → elegível p/ recall; `≥0.8` → elegível p/ ponte.
- **status:** `pending` (<0.6) → `active` (≥0.6) → `archived` (manual/decaído).
- **TTL:** instinct `pending` com `confidence<0.3` há >30 dias é podado (`prune`).

**Promoção:** mesmo trigger+action normalizado em **≥2 hashes de projeto distintos** → copiado para `global/`, `scope: global`.

## Privacidade e opt-in (alinhado ADR-005)

- `enabled: false` por default — nova seção `instincts:` no `.devflow.yaml`.
- Profile-gating `DEVFLOW_INSTINCT_PROFILE=off|minimal|standard` (espelha `ECC_HOOK_PROFILE`).
- Local-by-default: store XDG, nunca commitado; observações não saem da máquina.
- Redação na captura: nunca loga token/credencial; PII best-effort (email, IPv4, ≥9 dígitos).
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

## Pontos para revisão do architect (Step 3)

- Viabilidade do gate Bash→LLM (hook conta, sugere; mining in-session).
- Risco de sobreposição com MemPalace mining (`autoMine: post-merge`) — garantir papéis distintos.
- Tamanho/rotação do `observations.jsonl` (precedente de memory-explosion do ECC).

## Oportunidade de ADR (Step 3.5)

Decisão arquitetural provável de registro: **store de aprendizado próprio + disciplina opt-in/local herdada da ADR-005**. Avaliar relação com ADR-005 (extends?) na etapa 3.5.
