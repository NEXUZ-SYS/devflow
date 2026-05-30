---
name: knowledge
description: "Use quando o usuário pedir para criar, auditar ou documentar um doc de conhecimento narrativo (DDC). Trigger phrases: 'crie conhecimento', 'documentar visão', 'documentar persona', 'documentar arquitetura', 'knowledge para <camada>', 'knowledge builder', 'devflow knowledge new', 'audita knowledge', 'knowledge audit'. Dois modos: CREATE (resolve o tipo via taxonomy-of-knowledge.yaml → scaffold → curador polish) e AUDIT (checks K1–K5 via CLI)."
version: 0.1.0
deps:
  internal:
    - "scripts/devflow-knowledge.mjs"
    - "scripts/lib/knowledge-loader.mjs"
    - "scripts/lib/knowledge-from-type.mjs"
    - "scripts/lib/knowledge-audit.mjs"
    - "skills/knowledge/references/taxonomy-of-knowledge.yaml"
trigger_phrases:
  - "crie conhecimento"
  - "criar knowledge"
  - "documentar visão"
  - "documentar persona"
  - "documentar arquitetura"
  - "knowledge para"
  - "knowledge builder"
  - "devflow knowledge new"
  - "audita knowledge"
  - "knowledge audit"
---

# Knowledge Builder — DevFlow Edition (DDC)

Cria, faz scaffold e audita docs de conhecimento narrativo em `.context/<layer>/`. Um Knowledge doc é texto descritivo e contextual — NÃO uma regra lintável (isso é Standard), NÃO uma decisão tecnológica (isso é ADR). Ele serve de **memória narrativa** do projeto para o LLM e para o time.

**Core model:**

| Artifact | Camada | O que é | Auditado por |
|---|---|---|---|
| Knowledge doc | business / product / operations / engineering | Narrativa descritiva e contextual | K1–K5 (este skill) |
| Standard | standards | Regra operacional enforçável por linter | S1–S7 (`devflow:standards-builder`) |
| ADR | adrs | Decisão tecnológica registrada | `devflow:adr-builder` |

As quatro camadas:

- **business** — visão estratégica, glossário, compliance, modelo de negócio, métricas, ICP.
- **product** — visão de produto, design system, tone of voice, personas, políticas.
- **operations** — ambientes, deploy, monitoramento, rollback, incidentes, rotação de secrets, backups.
- **engineering** — narrativa descritiva de arquitetura e metodologias (o que o sistema é e como o time trabalha); Standards enforçam os detalhes.

**Announce ao iniciar:** "Invocando `devflow:knowledge` em modo <CREATE|AUDIT>."

---

## Step 0 — Detectar modo

Detecte em cascade — não pergunte se o sinal for claro:

| Trigger | Modo |
|---|---|
| `"crie knowledge"`, `"documentar <assunto>"`, `--type=<id>` | **create** ← default |
| `"audita knowledge-X"`, `--audit`, `--name=<name>` | **audit** |
| ambiguidade | apresente as duas opções em prosa |

**Routing:**
- `create` → Step 1
- `audit` → Step A1

---

## CREATE mode (Steps 1–5)

### Step 1 — Resolver o tipo

O usuário nomeia o assunto em prosa ("documenta nossa visão de negócio") ou como id (`business-vision`). Resolva contra `references/taxonomy-of-knowledge.yaml`:

- Se o assunto mapeia claramente a um `id` da taxonomia → **auto-confirma**.
- Se ambíguo → liste os candidatos e peça ao usuário para escolher o `id` exato.
- Se nenhum match → liste todos os ids por layer e ofereça: (a) escolher um existente, (b) usar o id de projeto customizado via `.context/knowledge.local.yaml`.

O `id` escolhido determina:
- `layer` → em qual subdir de `.context/` o arquivo será criado.
- `sectionTemplate` → seções de scaffold.
- `owner` → qual curador fará o polish.

### Step 2 — Scaffold via CLI

Com o `id` e o `name` em mãos, execute:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-knowledge.mjs new \
  --type=<id> --name=<name> --project=<path>
```

O CLI escreve `.context/<layer>/<name>.md` com frontmatter correto e seções marcadas com `<!-- TODO: preencher -->`. O caminho completo do arquivo é impresso em stdout.

Opções adicionais aceitas pelo CLI (use quando o usuário informar):
- `--version=<semver>` — versão do doc (padrão `1.0.0`).
- `--description=<texto>` — descrição curta para o frontmatter.
- `--force` — sobrescreve arquivo existente.

### Step 3 — Handoff para o curador

Após o scaffold, faça o handoff para o agente curador correspondente ao `owner` da entrada na taxonomia:

| `owner` | Agente curador |
|---|---|
| `business-context` | `devflow:business-context` |
| `product-context` | `devflow:product-context` |
| `operations-context` | `devflow:operations-context` |
| `engineering-context` | `devflow:engineering-context` |

O curador recebe o arquivo scaffolded e o contexto do projeto (lê `.context/` relevante) para preencher o conteúdo real. **Você não deve inventar fatos** — o curador decide o conteúdo a partir de grounding no projeto.

Se o agente curador não estiver disponível nesta sessão, anuncie: "Curador `<owner>` não disponível — o arquivo foi scaffolded em `<path>`. Acione `devflow:<owner>` em outra sessão para preencher o conteúdo."

### Step 4 — Audit K1–K5 (após polish)

Assim que o curador preencher o conteúdo (ou se o usuário disser "audita após criação"), execute:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-knowledge.mjs audit --name=<name> --project=<path>
```

Cinco checks (K1–K5). Se PASS → commit. Se há FAILs → relate e ofereça corrigir.

### Step 5 — Commit

```bash
git add .context/<layer>/<name>.md
git commit -m "feat(knowledge): add <id> <name>"
```

---

## AUDIT mode (Steps A1–A3) — inline, sem fluxo PREVC

### Step A1 — Resolver o alvo

Aceite `<name>` (sem extensão) ou caminho completo.

### Step A2 — Executar audit

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-knowledge.mjs audit --name=<name> --project=<path>
```

Cinco checks determinísticos:

- **K1** Frontmatter completo (`type`, `layer`, `name`, `activation`, `owner`)
- **K2** Nenhum placeholder `<!-- TODO: preencher -->` nas seções obrigatórias
- **K3** Layer coerente com a localização do arquivo
- **K4** Owner é um dos curadores canônicos
- **K5** Sem cross-referências duplicadas (conteúdo não replicado — use `@.context/...` para referências)

### Step A3 — Apresentar + recomendar

**Se PASSED (sem FAIL):** reporte. Se houver avisos, sugira melhorias opcionais.
**Se BLOCKED (≥1 FAIL):** mostre as falhas com diagnóstico. Ofereça: (a) corrigir agora, (b) chamar o curador, (c) apenas reportar.

---

## Hard rules

1. **Knowledge doc é narrativa.** Nunca adicione regras lintáveis — use `devflow:standards-builder` para isso.
2. **Nunca invente fatos.** O curador decide o conteúdo a partir do grounding do projeto. Scaffold com `<!-- TODO: preencher -->` é o estado correto até o curador atuar.
3. **Single source of truth.** Cross-referências usam `@.context/<layer>/<name>.md`; nunca duplique conteúdo entre docs.
4. **Prosa em pt-BR.** Termos técnicos em inglês são mantidos; seções e corpo em pt-BR.
5. **`activation: always` docs são críticos.** Docs `always` são carregados em toda sessão PREVC — mantenha-os concisos e precisos; prolixidade gera ruído de contexto.
6. **Engineering knowledge ≠ Standard.** Um doc `engineering-architecture-overview` descreve o sistema; a regra de enforço fica num std. O doc deve apontar para os stds via `## Standards que enforçam`.
7. **NUNCA editar `references/taxonomy-of-knowledge.yaml`** durante um flow de criação — extensões de projeto vão para `.context/knowledge.local.yaml`.

---

## Examples

### CREATE — business-vision

User: "Crie o knowledge de visão de negócio do projeto"

1. Step 1: id auto-confirmado como `business-vision` (layer: business, owner: business-context).
2. Step 2: `devflow-knowledge.mjs new --type=business-vision --name=business-vision --project=.`
   → CLI escreve `.context/business/business-vision.md` com seções scaffolded.
3. Step 3: handoff para `devflow:business-context`.
4. (Pós-polish) Step 4: `devflow-knowledge.mjs audit --name=business-vision --project=.` → PASSED.
5. Step 5: `git add .context/business/business-vision.md && git commit -m "feat(knowledge): add business-vision"`.

### AUDIT

User: "Audita o knowledge product-persona"

1. Step A2: `devflow-knowledge.mjs audit --name=product-persona --project=.`
2. K2 FAIL: placeholder `<!-- TODO: preencher -->` encontrado em `## Momento de valor`.
3. Reporta + oferece chamar `devflow:product-context` para preencher.

---

## Reference files

- `references/taxonomy-of-knowledge.yaml` — catálogo curado de tipos de knowledge por layer; projeto estende via `.context/knowledge.local.yaml`.
