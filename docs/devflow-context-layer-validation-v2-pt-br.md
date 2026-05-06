# Plano de validação devflow ↔ context layer (v2)

> Calibrado contra o estado real do `NEXUZ-SYS/devflow` v0.13.3 (abril 2026) e do `vinilana/dotcontext` v0.8.0. Substitui a v1 (`devflow-context-layer-validation-pt-br.md`).

O devflow já tem **8 das 12 dimensões de harness engineering** maduras (PREVC, ADR system v2.1, autonomy modes, TDD HARD-GATE, agents, skills, MemPalace, Napkin). Restam **4 gaps reais** a preencher: standards com enforcement, stack refs versionadas via pipeline artesanal (`docs-mcp-server` CLI + md2llm), permissions vendor-neutral e observability OTel. Esta v2 cobre só esses 4 — o ADR system existente é mais sofisticado que o blueprint propunha (ver `parecer-adr-builder-validacao.md`) e fica preservado, com 2 ajustes opcionais para v0.14 documentados aqui mas executados fora do escopo deste plano.

Cinco escolhas estruturais sustentam o resto do documento:

**1. Devflow continua bridge co-instalado, não wrapper MCP.** A arquitetura atual (`bridges superpowers + dotcontext` em Claude Code, Cursor, Codex, Gemini CLI, OpenCode) já funciona em 5 plataformas. Forçar wrapper MCP quebraria Codex (sem MCP) e Cursor (subagents sequencial). O plano respeita o status atual.

**2. ADR existente preservado.** O `adr-builder` v0.13.x do devflow é mais sofisticado que Nygard/MADR/Y (ver parecer). Apenas 2 ajustes opcionais para v0.14: campo `summary` (Y-statement curto) e seção "Drivers" opcional para decisões com 4+ forças concorrentes.

**3. Standards permanecem pasta dedicada.** ADRs registram decisões pontuais; standards são regras vivas. Enforcement do ADR pode apontar para um standard como mecanismo de verificação, mas os artefatos são distintos.

**4. Path canônico do ADR migra para `.context/adrs/`.** O v0.13.3 do devflow estabelece `.context/docs/adrs/` como HARD-GATE; este plano introduz Semana 0 (§4.6) que migra para `.context/adrs/` em v0.14, com dual-read transitório em v0.14 e v0.15, remoção em v0.16.

**5. Roadmap revisado para 4 semanas.** A v1 propunha 5; tirar ADR do escopo (já feito) reduz para 4. Standards continua como semana dedicada.

O processo de validação mantém as 5 fases que espelham o PREVC: **Audit → Spec → Implement → Verify → Continuous**. As fases continuam aplicáveis, mas calibradas para os 4 gaps reais.

---

# 1. Estado real do devflow + dotcontext

## 1.1 O que já está implementado e maduro

| Dimensão de harness | Status | Implementação |
|---|---|---|
| Memory (project knowledge) | ✅ | `.context/docs/` via dotcontext + MemPalace para semântica |
| Memory (session) | ✅ | Napkin (`.context/napkin.md`) + checkpoint/rehydration via PreCompact/PostCompact |
| Skills | ✅ | 32 skills no devflow + 10 do dotcontext |
| Agents | ✅ | 16 playbooks no devflow + 14 no dotcontext |
| Control (workflow loop) | ✅ | PREVC com gates + scale detection + 3 modos de autonomia |
| Control (TDD enforcement) | ✅ | HARD-GATE RED→GREEN→REFACTOR em todos os modos |
| Sync entre tools | ✅ | dotcontext export para 8+ ferramentas + devflow plugin para 5 |
| **ADRs first-class** | ✅ | adr-builder v0.13.x (CREATE/AUDIT/EVOLVE), 11 audit checks, 12 hard rules, 7 categorias, 4 evolve flows |

## 1.2 Os 4 gaps reais (escopo deste plano)

A ordem de prioridade é fixa. Cada gap tem uma pasta nova reservada e uma justificativa específica para a posição na fila.

**Gap 1 — Standards com enforcement** (pasta `.context/standards/`). Convenções hoje vivem espalhadas em ADRs Layered/SOLID/OWASP, em rules de cada agent, em `CONVENTIONS.md`. Falta tripla camada (Markdown + LLM-readable + linter executável) com aplicação por glob `applyTo`. ADR enforcement aponta para standards; standards são as regras operacionais vivas.

**Gap 2 — Stack refs versionadas via pipeline artesanal** (pasta `.context/stacks/`). O helper `detect-project-stack.sh` do devflow detecta py/ts/go/rust mas não tem fonte versionada de docs por library. Sem docs versionadas, agents alucinam APIs entre versões major. O pipeline artesanal (`docs-mcp-server` CLI em modo headless + `md2llm`) gera `.context/stacks/refs/<lib>@<version>.md` versionado em git, lido por filesystem no PreToolUse com filtragem semântica via `context-filter.mjs`. Sem dependência SaaS, sem rate limits, reproducibility token estável via hash do `.md`. Detalhes do benchmark que justifica essa escolha em `benchmark-context7-vs-artesanal-pt-br.md`.

**Gap 3 — Permissions vendor-neutral** (arquivo `.context/permissions.yaml`). O git-strategy hook + branch protection do devflow funcionam, mas são Claude-Code-específicos. Falta gramática portável (deny → allow → mode → callback) que outras tools (Cursor, Codex) possam consumir.

**Gap 4 — Observability OTel** (arquivo `.context/observability.yaml`). Logging atual via napkin/mempalace + `workflow/actions.jsonl` é proprietário. OTel GenAI semconv (namespace `gen_ai.*`) é o padrão emergente que replica em Langfuse, Phoenix, Datadog. Última prioridade — depende dos gaps 1-3 estarem instrumentados primeiro.

## 1.3 ADR ajustes opcionais (escopo separado para v0.14)

Aceitos do parecer:

**Ajuste A — campo `summary` no frontmatter.** Adicionar como opcional:

```yaml
summary: "<frase Y-statement, ≤ 240 caracteres>"
```

Quando preenchido, é o que `session-start` hook do devflow carrega no `<ADR_GUARDRAILS>` em vez do título nu. Stage-1 disclosure: 30 ADRs com summaries cabem em ~7K tokens; 30 ADRs inteiras não cabem.

**Ajuste B — micro-seção "Drivers" opcional.** Entre Contexto e Decisão, omitir se ≤2 forças:

```text
## Drivers (opcional, omitir se ≤2)
- <força técnica 1>
- <força técnica 2>
- <força técnica 3>
```

Materializar apenas em decisões com 4+ forças concorrentes (latência + custo + segurança + manutenção, por exemplo). Cabe nas 80–120 linhas se bullets ≤8 palavras.

**Implementação**: ajustes A e B são campos opcionais; ADRs existentes não precisam migrar. Ajuste C é breaking change controlado via dual-read transitório (ver §4.6 Semana 0). Versão alvo do `adr-builder`: v0.14. Tracking dos ajustes A e B fora deste plano; ajuste C é pré-requisito do roadmap (Semana 0).

**Ajuste C — migração de path `.context/docs/adrs/` → `.context/adrs/`** (breaking change controlado).

O HARD-GATE atual do v0.13.3 estabelece `.context/docs/adrs/` como save path canônico. Este ajuste muda para `.context/adrs/` (raiz de `.context/`, plural). Justificativa em três pontos:

1. **Consistência com outros artefatos devflow.** `.context/standards/`, `.context/stacks/`, `.context/permissions.yaml`, `.context/observability.yaml`, `.context/.devflow.yaml` — todos vivem na raiz de `.context/`. ADRs também são domínio devflow (não dotcontext), e devem seguir o mesmo padrão.
2. **Separação clara entre conteúdo dotcontext e devflow.** `docs/` é território dotcontext (project knowledge gerenciado via `context.fill`); `adrs/` é decisão arquitetural gerenciada pelo `adr-builder`. Misturar os dois sob `docs/` confunde a fronteira.
3. **Encurtamento de path em logs e imports.** Reduz overhead em `<ADR_GUARDRAILS>` injection, paths em `actions.jsonl` e referencias em outros artefatos.

Implementação detalhada na §4.6 (fase Semana 0). Dual-read transitório por 2 versões (v0.14, v0.15); remoção do path antigo em v0.16. Migração de ADRs em projetos existentes é atividade manual (fora do plano) — poucos projetos usam o `adr-builder` em produção hoje.

## 1.4 Princípio de não-invasão (mantido da v1)

Devflow respeita 4 invariantes operacionais — **revisados** para refletir que devflow é bridge, não wrapper:

1. **Devflow não toca em arquivos do dotcontext em runtime.** Para criar conteúdo em `docs/`, `skills/`, `agents/`, `plans/`, devflow chama gateway MCP do dotcontext quando disponível, ou usa `dotcontext sync` quando não.
2. **Devflow não modifica arquivos auto-gerados.** `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CONVENTIONS.md` na raiz — se gerados pelo `dotcontext sync export`, devflow não toca.
3. **As 4 novas pastas/arquivos do devflow** (`standards/`, `stacks/`, `permissions.yaml`, `observability.yaml`) **convivem** com o `.context/` do dotcontext; não substituem.
4. **Falha rápido se dotcontext ou superpowers não instalados.** Devflow não replica essas infraestruturas; requer que existam.

# 2. Mapa de integração revisado

## 2.1 Quem opera o quê

A divisão de responsabilidades está mais granular agora que ADR fica do lado do devflow (já implementado lá):

| Caminho | Dono | Como o outro lado interage |
|---|---|---|
| `.context/docs/` | dotcontext | devflow lê via `context.getMap` (não toca neste diretório) |
| `.context/adrs/` | **devflow** (adr-builder) | dotcontext apenas referencia paths em outros docs; path canônico desde v0.14 |
| `.context/skills/` | dotcontext | devflow lê via `skill.list`; devflow shipa skills próprias via plugin |
| `.context/agents/` | dotcontext | devflow lê via `agent.discover`; devflow shipa 16 agents via plugin |
| `.context/plans/` | dotcontext | devflow chama `plan.link`, `plan.updatePhase`, `plan.commitPhase` |
| `.context/workflow/` | dotcontext | devflow lê `actions.jsonl` |
| `.context/templates/adrs/` | **devflow** | template ADR + 6 templates organizacionais |
| `.context/napkin.md` | **devflow** | runbook curado (skill napkin) |
| `.context/standards/` | **devflow (novo)** | dotcontext referencia via paths |
| `.context/stacks/` | **devflow (novo)** | dotcontext lê quando agent precisa de stack info |
| `.context/permissions.yaml` | **devflow (novo)** | dotcontext não interage |
| `.context/observability.yaml` | **devflow (novo)** | dotcontext não interage |
| `.context/.devflow.yaml` | **devflow** | já existe (config: autoFinish, lang etc.) |
| `.context/.lock` | **devflow (novo)** | content hashes para reproducibility |

## 2.2 Fluxo de chamada típico (calibrado, com filtragem semântica)

Diferente da v1: devflow é bridge, não wrapper. O fluxo segue o lifecycle do **plugin** Claude Code (ou Cursor, Codex etc.), com hooks devflow nos pontos certos. **Princípio operacional**: SessionStart fica minimalista (só o que é universalmente relevante); o grosso do contexto carrega just-in-time no PreToolUse, filtrado semanticamente pelo arquivo da task.

```text
[usuário envia comando /devflow ...]
   │
   ▼
[Claude Code invoca devflow plugin]
   │
   │ SessionStart hook (1x por sessão) — minimalista
   │   ├─ injeta <PERMISSIONS_DIGEST> (deny rules + mode)
   │   ├─ injeta <CONTEXT_INDEX> (Stage-1: só IDs+nomes de ADRs/standards/stacks)
   │   └─ ativa OTel span raiz da sessão (opt-in)
   │
   ▼
[skill devflow:prevc-flow ou outro skill é invocado]
   │
   ▼
[Tool é selecionado pelo agent: Edit, Write, Bash, mcp__dotcontext__*, etc.]
   │
   ▼
[PreToolUse hook] — ponto-chave da governança e do contexto
   │
   │ 1. Permission check (deny-first, sempre)
   │    └─ se deny: aborta sem invocar tool
   │
   │ 2. Filtragem semântica via lib context-filter (se Edit/Write)
   │    │
   │    ├─ filterAdrs(filePath, taskKeywords) → top-N ADRs aplicáveis (Stage-2)
   │    ├─ filterStandards(filePath) → standards com applyTo glob match
   │    ├─ filterStacks(filePath) → frameworks aplicáveis ao arquivo
   │    └─ injectIntoContext(filtered) → <ADR_FOR_TASK>, <STANDARDS_FOR_TASK>, <STACK_FOR_TASK>
   │
   │ 3. Carrega stack refs via filesystem (não há fetch externo)
   │    └─ lê .context/stacks/refs/<lib>@<version>.md de cada stack filtrado
   │
   │ 4. OTel attributes (se opt-in)
   │    ├─ devflow.context.adrs_filtered_in
   │    ├─ devflow.context.adrs_filtered_out
   │    ├─ devflow.context.tokens_loaded
   │    └─ devflow.context.tokens_budget_status (under | warn | over)
   │
   ▼
[Tool executa]
   │
   ▼
[PostToolUse hook]
   │
   ├─ se Bash de finalização (gh pr merge, etc.): branch finalize prompt (já existe)
   ├─ se Edit/Write: roda computational sensors do standard aplicável
   ├─ atualiza napkin diary (já existe)
   └─ fecha span OTel com gen_ai.usage.* (opt-in)

   │
   ▼
[PreCompact hook (se contexto encher)]
   │   └─ flushes mempalace + napkin (já existe)
   ▼
[PostCompact hook]
   │   └─ rehydrates handoff (já existe)
```

Pontos críticos do fluxo revisado:

- **SessionStart é minimalista.** Apenas `PERMISSIONS_DIGEST` (deny rules sempre relevantes) e um `CONTEXT_INDEX` Stage-1 — só IDs e summaries dos artefatos disponíveis, **sem corpos**. Isso evita overcontext upfront e mantém o budget intacto para a task real.
- **PreToolUse é o ponto-chave do contexto.** É aqui que ADRs, standards e stack docs entram, filtrados semanticamente pelo arquivo da task. Stage-2 do progressive disclosure.
- **PostToolUse é o ponto-chave do enforcement.** Hoje atualiza napkin; passa a rodar computational sensors quando arquivo editado tem standard aplicável.
- **Filtragem é síncrona e centralizada.** Lib Node `scripts/lib/context-filter.mjs` invocada direto pelos hooks (não via skill). Skills `adr-filter`, `standard-filter` etc. continuam para uso interativo via `/devflow context filter --explain`.
- **OTel rastreia tokens carregados desde v0.14**, mesmo sem token budget enforcement ativo. Observabilidade primeiro, gates depois.
- **Sem teto fixo nesta versão.** Token budget enforcement é roadmap futuro (após 2-3 sprints de telemetria em projetos NXZ reais). Default warn-only quando ativado.

## 2.3 Onde o pipeline artesanal entra concretamente

A v1 propunha um wrapper que chama Context7 antes do dotcontext. A análise comparativa em `benchmark-context7-vs-artesanal-pt-br.md` mostrou que o pipeline artesanal vence em latency (70x), token count (-33%), recall estimado (+11pp) e custo ($0 vs $28-108/mês). Esta versão adota pipeline artesanal como **única fonte de stack docs** — Context7 não é nem fallback. Bibliotecas ad-hoc (libs novas que aparecem em uma task e não estão no manifest) entram via comando explícito `devflow stacks scrape <lib> <version>`, não via SaaS automático.

O pré-fetch acontece no **PreToolUse hook** lendo direto do filesystem:

```typescript
// hook devflow PreToolUse (pseudocódigo)
async function preToolUse(event: ToolUseEvent) {
  // 1. Permission check (sempre)
  const denied = checkPermissions(event, ".context/permissions.yaml");
  if (denied) return { permissionDecision: "deny", reason: denied };

  // 2. Stack refs aplicáveis ao arquivo
  if (event.tool === "Edit" || event.tool === "Write") {
    const stacks = readYaml(".context/stacks/manifest.yaml");
    const matching = stacks.frameworks.filter(f =>
      micromatch.isMatch(event.path, f.applyTo)
    );

    // Top-N por relevância (sem hard limit externo)
    const topN = matching.slice(0, 5);

    for (const fw of topN) {
      // Lê stack ref versionado do filesystem
      const refPath = `.context/stacks/refs/${fw.artisanalRef}`;
      if (!existsSync(refPath)) {
        warn(`Stack ref missing for ${fw.name}@${fw.version}; rode "devflow stacks scrape ${fw.name} ${fw.version}"`);
        continue;
      }

      const ref = readFileSync(refPath, "utf-8");

      // Filtragem semântica via context-filter.mjs
      const snippets = filterStackSnippets(ref, {
        filePath: event.path,
        taskKeywords: extractKeywords(event.prompt),
        topN: 8
      });

      injectIntoContext(snippets, "STACK_FOR_TASK");
    }
  }

  // 3. OTel span (opt-in)
  if (otelEnabled) {
    span.setAttributes({
      "gen_ai.tool.call.id": event.id,
      "devflow.standards.applied": matchingStandards.map(s => s.id),
      "devflow.stacks.refs_loaded": topN.map(f => f.artisanalRef),
      "devflow.stacks.tokens_loaded": estimateTokens(allSnippets)
    });
  }
}
```

Três pontos não-óbvios:

**Sem hard limit externo (era 3 do Context7).** O limite agora é apenas o budget local de tokens — pode carregar 5, 10 ou 20 stacks se cada um contribui pouco depois da filtragem semântica. A §2.4 cobre o budget enforcement (warn-only em v0.14, sem teto fixo).

**Bibliotecas ad-hoc requerem scrape explícito.** Quando dev menciona uma lib que não está no manifest, devflow emite warning e sugere `devflow stacks scrape <lib> <version>`. Custo: ~3 minutos de scrape + commit. Em troca: determinismo, sem dependência SaaS, sem rate limit. Não há fallback automático — é decisão consciente do plano.

**Filtragem semântica é o equivalente do `topic` do Context7.** O Context7 aceitava `topic: "auth"` para focar a doc retornada. No pipeline artesanal, isso vira `extractKeywords(event.prompt)` cruzado com `TITLE/DESCRIPTION/SOURCE` dos snippets via `context-filter.mjs`. Mais determinístico (mesmo prompt → mesmos snippets) e mais auditável (logs do filtro mostram exatamente o que entrou e saiu).

## 2.4 Validação semântica e budget de contexto

A §2.2 mostra o que entra no SessionStart vs. PreToolUse. Esta seção formaliza **como** a filtragem semântica acontece, **onde** ela é centralizada, e **qual** observabilidade existe — sem teto fixo nesta versão (v0.14), com ativação de gates de budget como roadmap futuro.

### 2.4.1 Os 5 gates da validação de contexto

Os gates são hierárquicos: cada um age antes do próximo. Os 4 primeiros estão no escopo desta v2 (implementação em v0.14); o 5º é roadmap.

**Gate 1 — Just-in-time vs. SessionStart.** Apenas o que é universalmente relevante entra no SessionStart: `PERMISSIONS_DIGEST` (deny rules sempre aplicam) e `CONTEXT_INDEX` Stage-1 (lista de IDs disponíveis, sem corpos). Tudo mais carrega just-in-time no PreToolUse, filtrado pelo arquivo da task. Esse gate sozinho elimina ~80% do problema de overcontext porque a maior parte do conteúdo passa a ser **localizado**, não **broadcast**.

**Gate 2 — Semantic filtering (filterAdrs, filterStandards, filterStacks).** No PreToolUse, a lib `context-filter.mjs` executa filtragem em 4 dimensões:

- **applyTo glob match** — só carrega artefatos cujo `applyTo` bate com o arquivo sendo editado
- **status/lifecycle** — apenas ADRs `Aprovado`, standards `Ativo`, stacks com `artisanalRef` apontando para arquivo existente
- **stack relevance** — não carrega standard React em projeto Python
- **task keyword match** — extrai keywords da última mensagem do usuário (ou do prompt do tool) e cruza com `tags`/`category`/`topics`

Output da filtragem é uma lista ranqueada com score de relevância. Top-N (configurável, default 5) entra no contexto.

**Gate 3 — Token observability (sem teto, v0.14).** Cada chamada de filtragem emite no OTel span:

- `devflow.context.adrs_filtered_in` — IDs carregados
- `devflow.context.adrs_filtered_out` — IDs ignorados (com motivo)
- `devflow.context.standards_filtered_in/out`
- `devflow.context.stacks_filtered_in/out`
- `devflow.context.tokens_loaded` — soma estimada (via tiktoken)
- `devflow.context.tokens_budget_status` — sempre `under` na v0.14 (sem teto)

Telemetria é opt-in via `.context/observability.yaml`, mas o cálculo dos tokens roda sempre — fica disponível no audit trail.

**Gate 4 — Progressive disclosure no PreToolUse.** Quando agent vai editar arquivo, PreToolUse injeta corpos completos dos artefatos filtrados (Stage-2). Não usa `summary` do ADR aqui — esse campo é Stage-1 e já está no `CONTEXT_INDEX` desde SessionStart. PreToolUse carrega o ADR inteiro para os 5-10 ADRs que realmente importam para a task.

**Gate 5 — Token budget enforcement (roadmap, pós-v0.14).** Quando 2-3 sprints de telemetria mostrarem padrões consistentes, ativa-se o gate de budget. Default: `mode: warn-only` (carrega tudo, emite warning). Configurável para `mode: soft-drop` (corta menos relevantes) ou `mode: hard-fail` (bloqueia). Decisão do teto baseada em dados reais, não em chute.

### 2.4.2 Lib `scripts/lib/context-filter.mjs` — interface

A lib é o ponto único de filtragem semântica. Hooks invocam direto (síncrono); skills invocam via wrapper async. API mínima:

```typescript
// scripts/lib/context-filter.mjs
import { encode } from "tiktoken";

export interface FilterContext {
  filePath: string;          // arquivo sendo editado
  taskKeywords: string[];    // extraídos do prompt do user/tool
  projectStack: string;      // detect-project-stack.sh output
  topN?: number;             // default 5
}

export interface FilteredArtifact {
  id: string;
  type: "adr" | "standard" | "stack";
  path: string;
  body: string;              // corpo completo (Stage-2)
  score: number;             // 0-1, ranking de relevância
  reason: string;            // por que foi incluído
  tokens: number;            // contagem via tiktoken
}

export interface FilterResult {
  included: FilteredArtifact[];
  excluded: { id: string; type: string; reason: string }[];
  totalTokens: number;
  budgetStatus: "under" | "warn" | "over";  // sempre "under" em v0.14
}

export function filterAdrs(ctx: FilterContext): FilterResult;
export function filterStandards(ctx: FilterContext): FilterResult;
export function filterStacks(ctx: FilterContext): FilterResult;

// Scoring: applyTo match > task keyword match > stack relevance > recency
export function scoreArtifact(artifact: any, ctx: FilterContext): number;

// Helper para hooks injetarem no contexto
export function injectIntoContext(
  results: FilterResult[],
  tagPrefix: string  // "ADR_FOR_TASK" | "STANDARDS_FOR_TASK" | etc.
): string;
```

Decisões de design:

- **Síncrono.** Hook tem latência sub-100ms; async tem custo de await. Filesystem reads de ADRs (geralmente ≤50 arquivos) cabem em <50ms síncronos.
- **Sem cache em memória entre invocações de hook.** Cada PreToolUse re-lê do disco. Trade-off: simplicidade > performance. Se vira gargalo (>200ms), adicionar cache LRU é trivial.
- **Tiktoken via WASM.** Conta tokens deterministicamente. Adiciona ~5MB ao plugin. Aceitável.
- **Sem dependências externas além de tiktoken.** Lib stdlib + glob + yaml parsing já disponíveis.

### 2.4.3 Comando `devflow context filter --explain`

Modo "EXPLAIN" do SQL para context loading. Permite auditar a filtragem sem rodar uma task real. Saída exemplo:

```text
Task: "adicionar validação JWT no middleware"
File: src/middleware.ts
Stack detected: typescript / next.js

ADRs filtrados (3 incluídos de 47 disponíveis):
  ✓ ADR-0007 auth-jwt-strategy        score=0.92  [applyTo: src/middleware.ts ✓]
  ✓ ADR-0012 error-handling-base      score=0.78  [tags: error-handling ↔ task]
  ✓ ADR-0034 secrets-management       score=0.71  [topic: jwt ↔ task keywords]

ADRs ignorados (top 3 mostrados):
  ✗ ADR-0019 react-server-components  reason=applyTo no match (src/**/*.tsx)
  ✗ ADR-0023 prisma-schema-conventions reason=applyTo no match (prisma/**)
  ✗ ADR-0041 cookie-strategy          reason=status: Substituido (não Aprovado)
  [+41 outros]

Standards (2 incluídos de 8):
  ✓ std-error-handling                score=0.85  [applyTo: src/**/*.ts ✓]
  ✓ std-async-patterns                score=0.62  [tags: async ↔ task]

Stacks (1 incluído de 5):
  ✓ next.js v15.0.0                   score=0.95  [applyTo: src/middleware.ts ✓]
    └─ Stack ref: refs/next@15.0.0.md (filesystem, hash a3f9c2...)

Token estimate: 4.247 tokens
Budget status: under (no fixed cap in v0.14)
```

Esse comando é a ferramenta principal para o time validar que a filtragem está fazendo a coisa certa antes de a v0.14 chegar em produção.

### 2.4.4 Por que não adotar tetos fixos agora

Três razões:

1. **Falta de baseline.** Não há dados de quantos tokens projetos NXZ típicos consomem hoje no SessionStart. Definir teto sem dados é chutar.
2. **Custos de calibração errada.** Teto muito baixo: agent perde contexto crítico, qualidade cai. Teto muito alto: não previne overcontext. Erro caro nos dois sentidos.
3. **Padrão da indústria.** Anthropic, LangChain, OpenAI todos publicam targets aspiracionais (~5%, ~10%) mas não enforçam — porque a janela de 200K já cobre 95% dos casos. Optimizar antes de medir é prematuro.

A v0.14 implementa observabilidade (Gate 3); v0.15 ou v0.16 ativa enforcement (Gate 5) com teto calibrado por dados reais. Decisão do teto vira um ADR próprio quando chegar a hora.



---

---

# 3. Pipeline artesanal — implementação de referência

Esta seção fecha o gap entre **decisão arquitetural** (ADR-0002 em §5.3) e **execução prática**. Os subitens explicam o que é um `artisanalRef`, qual o formato exato do arquivo `.md` referenciado, como o pipeline gera esse arquivo, e quais comandos o time NXZ usa para rodar tudo. Sem esta seção, o ADR-0002 fica abstrato — com ela, o roadmap da Semana 3 (§7) é executável.

## 3.1 O que é um `artisanalRef` e seu ciclo de vida

`artisanalRef` é um campo do `manifest.yaml` (cada framework tem o seu) que aponta para um arquivo `.md` relativo a `.context/stacks/`. Exemplo:

```yaml
frameworks:
  next:
    version: "15.0.0"
    artisanalRef: refs/next@15.0.0.md
```

A resolução é literal — `path.join('.context/stacks', 'refs/next@15.0.0.md')` — sem indireção, sem hash store, sem id opaco. Qualquer dev consegue inspecionar o arquivo direto via `cat`, `less`, `grep`. Diff em git é legível. Conteúdo é **texto plano consolidado**, não JSON nem SQLite blob.

**Ciclo de vida em 5 estágios:**

1. **Geração inicial** — quando dev adiciona library nova ao projeto. Trigger: `devflow stacks scrape-batch` (§3.4) ou `devflow stacks scrape` single-lib (§3.5). Output: `.context/stacks/refs/<lib>@<version>.md` versionado em git.

2. **Uso em runtime** — PreToolUse hook lê o arquivo via `context-filter.mjs`, aplica filtragem semântica (snippets cujos `SOURCE`/`TITLE`/`LANGUAGE` batem com a task), injeta no contexto. Latency: ~30ms para leitura + filtragem.

3. **Refresh por release** — quando library lança nova versão major. Trigger: dev decide upgrade, abre ADR de upgrade (categoria: arquitetura), roda `devflow stacks scrape <lib> <version>` com nova versão. Gera arquivo paralelo (`refs/<lib>@<new-version>.md`); `manifest.yaml` aponta `artisanalRef` para o novo. Versão antiga fica em git history para audit trail.

4. **Drift detection** — job nightly (descrito em §4.5/Continuous) compara versão em `package.json` vs versão pinada no manifest. Se major version drift detectada, abre issue automática sugerindo refresh.

5. **Deprecation** — quando library deixa de ser usada no projeto. Dev remove entry do manifest; `git rm .context/stacks/refs/<lib>@<version>.md`. ADR de remoção é opcional (decisão informacional, não arquitetural).

## 3.2 Anatomia do arquivo `.md`

O arquivo é **concatenação dos outputs do `md2llm`** em ordem alfabética por path original. Cada snippet é um bloco com headers fixos, separados pelo delimitador padrão do md2llm (`----------------------------------------`).

Amostra mínima (1 snippet do Next.js 15 hipotético, formato real do md2llm):

```text
TITLE: Middleware com validação JWT
DESCRIPTION: Padrão recomendado para autenticação em middleware Next.js 15 usando cookies async
SOURCE: docs/15/app/api-reference/file-conventions/middleware.md
LANGUAGE: typescript
CODE:
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function middleware(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
----------------------------------------
```

**Tamanhos típicos** (calibrados pelo benchmark `benchmark-context7-vs-artesanal-pt-br.md`):

| Library | Snippets típicos | Tamanho `.md` consolidado | Tokens (tiktoken) |
|---|---|---|---|
| Next.js 15 (App Router) | 280-340 | ~290KB | ~72.000 |
| React 19 | 160-200 | ~170KB | ~42.000 |
| Prisma 5 | 180-220 | ~195KB | ~48.000 |
| Vitest 1.6 | 60-80 | ~58KB | ~14.000 |
| FastAPI | 220-260 | ~240KB | ~60.000 |

**Por que esse formato funciona para LLM context.** O md2llm extrai apenas blocos de código com metadata mínima — não inclui prosa explicativa. Para o agent que precisa **gerar código**, isso é o que importa: ver como código se parece, onde ele apareceu na doc oficial (`SOURCE`), em que linguagem (`LANGUAGE`). Reduz ~76% vs markdown completo (medido no benchmark §1.4) sem perder valor para a tarefa.

**Ordem alfabética importa.** Se a lib tem doc estruturada (`docs/getting-started/`, `docs/api-reference/`, `docs/guides/`), a ordem alfabética dos paths resulta em agrupamento natural por categoria. Filtragem semântica via `context-filter.mjs` ainda funciona (snippets têm `SOURCE` próprio), mas browsing humano também fica navegável.

## 3.3 Pipeline de geração — 4 estágios concretos

O pipeline tem 4 estágios bem definidos. Separação importa porque cada estágio pode falhar ou ser re-executado independentemente.

**Estágio 1 — RESOLVE.** Determina library, versão, fonte. Inputs: nome da lib (`next`), versão (`15.0.0`), tipo de fonte (`github`/`docs-site`/`local`), URL ou repo. Output: structured config para os próximos estágios.

```typescript
interface ResolvedStack {
  library: string;          // "next"
  version: string;          // "15.0.0"
  source: {
    type: "github" | "docs-site" | "local";
    repo?: string;          // "vercel/next.js"
    tag?: string;           // "v15.0.0"
    path?: string;          // "docs/"
    url?: string;           // "https://www.prisma.io/docs/orm"
    sitemap?: string;       // "https://nextjs.org/sitemap.xml"
  };
  outputDir: string;        // "/tmp/scrape-next-15.0.0/"
  refPath: string;          // ".context/stacks/refs/next@15.0.0.md"
}
```

Este estágio também valida que `artisanalRef` declarado no manifest combina com `<lib>@<version>.md` esperado. Se divergem, falha com erro explícito.

**Estágio 2 — SCRAPE.** Invoca `docs-mcp-server` CLI em modo headless. Dois caminhos dependendo de `source.type`:

Para `github`:

```text
git clone --depth 1 --branch v15.0.0 https://github.com/vercel/next.js.git /tmp/next-15-clone
cp -r /tmp/next-15-clone/docs/* /tmp/scrape-next-15.0.0/raw/
rm -rf /tmp/next-15-clone
```

Para `docs-site`:

```text
# 1. Pega sitemap
curl -s https://www.prisma.io/sitemap.xml > /tmp/sitemap.xml

# 2. Filtra URLs relevantes (documentação)
xmllint --xpath "//url/loc/text()" /tmp/sitemap.xml | grep "/docs/orm/" > /tmp/urls.txt

# 3. fetch-url em loop, paralelizado em 5
cat /tmp/urls.txt | xargs -P 5 -I {} sh -c '
  npx -y --package=@arabold/docs-mcp-server docs-cli fetch-url "{}" \
    > /tmp/scrape-prisma-5.18.0/raw/$(echo "{}" | sed "s|[^a-zA-Z0-9]|_|g").md
'
```

Output: pasta `/tmp/scrape-<lib>-<version>/raw/` com 1 arquivo `.md` por página da doc, em markdown limpo (já convertido pelo `docs-mcp-server`).

**Estágio 3 — REFINE.** Invoca `md2llm` na pasta de output do estágio 2:

```text
md2llm /tmp/scrape-next-15.0.0/refined /tmp/scrape-next-15.0.0/raw \
  --source-url "https://github.com/vercel/next.js/blob/v15.0.0/docs/" \
  --exclude "images,build"
```

Output: pasta `/tmp/scrape-<lib>-<version>/refined/` com snippets em formato `TITLE/DESCRIPTION/SOURCE/LANGUAGE/CODE` (decisão de design: formato `.md`, não `.mdc`/Cursor — devflow não usa `alwaysApply`).

**Estágio 4 — CONSOLIDATE & COMMIT.** Concatena, valida, registra hash, commita:

```text
# 1. Consolida em arquivo único, ordem alfabética
cat /tmp/scrape-next-15.0.0/refined/*.md > .context/stacks/refs/next@15.0.0.md

# 2. Sanity check: pelo menos 5 snippets
SNIPPETS=$(grep -c "^TITLE:" .context/stacks/refs/next@15.0.0.md)
if [ "$SNIPPETS" -lt 5 ]; then exit 1; fi

# 3. Atualiza .lock com hash sha256
HASH=$(sha256sum .context/stacks/refs/next@15.0.0.md | cut -d' ' -f1)
yq -i ".stacks.\"next@15.0.0\".sha256 = \"$HASH\"" .context/.lock

# 4. Commit
git add .context/stacks/refs/next@15.0.0.md .context/.lock
git commit -m "chore(stacks): scrape next@15.0.0 (sha256 ${HASH:0:8})"

# 5. Cleanup
rm -rf /tmp/scrape-next-15.0.0/
```

Tempos típicos por estágio (calibrados):

| Estágio | Next.js 15 (GitHub) | Prisma 5 (docs-site) | Vitest 1.6 (docs-site) |
|---|---|---|---|
| RESOLVE | <1s | <1s | <1s |
| SCRAPE | 20-40s | 90-180s | 30-60s |
| REFINE | 2-5s | 2-5s | 1-2s |
| CONSOLIDATE | 1-2s | 1-2s | <1s |
| **Total** | **~30s** | **~3 min** | **~45s** |

## 3.4 `devflow stacks scrape-batch` — comando principal

Este é o **comando que o time NXZ usa no dia-a-dia**. Combina descoberta automática de fontes, confirmação humana, e execução paralela do pipeline para múltiplas libs.

### 3.4.1 Sintaxe

```text
devflow stacks scrape-batch [<lib1>@<version1> <lib2>@<version2> ...]
  [--from-package]              # detecta libs de package.json/pyproject.toml/Cargo.toml/go.mod
  [--from-manifest]             # lê seção wishlist: do .context/stacks/manifest.yaml
  [--from-args]                 # explícito (default quando args fornecidos)
  [--strategy=registry|llms-txt|web-search|all]   # default: all
  [--dry-run]                   # mostra plano sem executar
  [--concurrency=N]             # paralelismo do pipeline (default: 3)
  [--output-format=text|json]   # default: text
```

Os 4 modos de input são **mutuamente exclusivos** mas sobreponíveis (se múltiplos forem passados, devflow consolida em uma lista deduplicada e avisa quais sources foram usados).

### 3.4.2 Fluxo de execução em 4 fases

**Fase A — INPUT RESOLUTION.** Resolve a lista final de stacks para processar:

- Se `--from-package`: parse `package.json` (deps + devDeps) + `pyproject.toml` (dependencies) + `Cargo.toml` ([dependencies]) + `go.mod` (require). Extrai versões resolvidas de `package-lock.json`/`pnpm-lock.yaml`/`Pipfile.lock` quando disponível, senão usa o range declarado.
- Se `--from-manifest`: lê seção `wishlist:` do `.context/stacks/manifest.yaml` (formato proposto: lista de objetos `{ library, version, hint? }`).
- Se args explícitos: parse `<lib>@<version>` cada um.
- Combina, deduplica, ordena alfabeticamente.

**Fase B — DISCOVERY.** Para cada stack, descobre fonte oficial via 3 estratégias em sequência:

```text
1. REGISTRY LOOKUP (rápido, alta confiança quando disponível)
   ├── npm registry: GET https://registry.npmjs.org/<package>
   │   └── extrai .repository.url e .homepage
   ├── PyPI: GET https://pypi.org/pypi/<package>/json
   │   └── extrai .info.project_urls (Documentation, Source)
   ├── crates.io: GET https://crates.io/api/v1/crates/<crate>
   │   └── extrai .crate.repository e .crate.documentation
   └── Go proxy: GET https://proxy.golang.org/<module>/@v/<version>.info
       └── extrai source URL

2. LLMS.TXT PROBE (quando registry retornou homepage)
   ├── HEAD <homepage>/llms.txt
   ├── HEAD <homepage>/.well-known/llms.txt
   └── Se 200 OK: fonte canônica encontrada (confidence ≥ 0.95)

3. WEB_SEARCH VIA CLAUDE (fallback para casos ambíguos)
   ├── Query: "<library> <version> official documentation source"
   ├── Claude analisa top-5 resultados
   ├── Retorna: { type, url, confidence (0-1), reasoning }
   └── Confidence < 0.6: marca como "INCERTA" para humano resolver
```

**Fase C — CONFIRMAÇÃO HUMANA.** Apresenta plano consolidado, sempre prompta:

```text
═══ Plano de scrape (3 libraries) ═══

[1] next@15.0.0
    Fonte sugerida: github://vercel/next.js@v15.0.0/docs
    Confidence: 0.95 (registry + GitHub docs/ confirmados)
    Tempo estimado: ~30s

[2] prisma@5.18.0
    Fonte sugerida: docs-site://www.prisma.io/docs/orm
    Confidence: 0.78 (registry homepage + sitemap encontrado)
    Alternativa: github://prisma/prisma@5.18.0/docs (confidence 0.55)
    Tempo estimado: ~3 min

[3] vitest@1.6.0
    Fonte sugerida: llms-txt://vitest.dev/llms.txt
    Confidence: 0.98 (llms.txt encontrado, fonte canônica)
    Tempo estimado: ~10s

Tempo total estimado: ~4 min

Confirma? [y/n/edit/details]
  y       = executar
  n       = cancelar (nenhuma mudança)
  edit    = ajustar fonte de uma lib específica
  details = ver discovery trace de cada lib
```

A interação humana respeita a `REGRA GERAL DE EXECUÇÃO` do projeto NXZ — nunca executa write actions sem plano + OK explícito. `edit` permite trocar a fonte sugerida (ex.: prisma fica em docs-site mas dev sabe que `github://prisma/prisma/docs/` tem versão mais completa); `details` mostra o trace da Fase B para audit.

**Fase D — EXECUÇÃO COM ERROR HANDLING.** Roda pipeline em paralelo (default `concurrency: 3`), com handling de falha interativo:

```text
Executando 3 stacks (concurrency: 3)...

[1/3] next@15.0.0       ✓ 312 snippets, 287KB (28s)
[2/3] prisma@5.18.0     ✗ FALHA no estágio SCRAPE (timeout após 5min)
[3/3] vitest@1.6.0      ✓ 67 snippets, 42KB (9s)

═══ Falha em prisma@5.18.0 ═══
Estágio: SCRAPE (docs-site fetch)
Erro: timeout após 5min em https://www.prisma.io/docs/orm
Sugestão: tentar alternativa github://prisma/prisma@5.18.0/docs

Como proceder?
  retry          = tentar novamente (mesma fonte)
  retry-alt      = tentar fonte alternativa
  skip           = pular esta lib (continua com sucesso parcial)
  abort          = abortar tudo (rollback dos commits parciais)
  edit           = trocar fonte e tentar de novo
```

Após decisão humana, comando executa. **Sucesso parcial é commitado** apenas se humano escolher `skip` explicitamente — nunca silently. Default `abort` mantém integridade transacional.

### 3.4.3 Exemplos completos de uso

**Cenário 1: setup inicial de projeto novo.**

`devflow stacks scrape-batch --from-package`

Auto-detecta de `package.json`. Para projeto Next.js típico, descobre `next`, `react`, `react-dom`, `@types/node`, `eslint`, `prettier`, `tailwindcss`, `tsx`, `vitest`. Apresenta ~9 fontes sugeridas com confidences. Humano confirma, devflow scraping em paralelo (concorrência 3). Tempo total: ~5-8 minutos para projeto típico. Resultado: 9 arquivos em `refs/`, manifest atualizado, 1 commit final.

**Cenário 2: upgrade de major release.**

`devflow stacks scrape-batch next@16.0.0`

Lib única, fonte já conhecida (mesma do `next@15.0.0` existente, só muda tag). Discovery rápido (~5s), humano confirma, scrape ~30s, novo arquivo `refs/next@16.0.0.md` ao lado do existente. Manifest fica com **ambos artisanalRefs** durante a transição (período de coexistência); ADR de upgrade documenta a migração. Após validação no projeto, dev remove `next@15.0.0.md`.

**Cenário 3: lib ad-hoc descoberta em task.**

Agent vai editar arquivo que importa `hono`. Hook PreToolUse detecta que `hono` não está no manifest, emite warning. Dev decide adicionar:

`devflow stacks scrape-batch hono@4.6.0`

Discovery descobre `https://hono.dev/llms.txt` (que existe), confidence 0.97, scrape em ~10s. Manifest ganha entry. Próxima invocação do hook já injeta snippets de Hono no contexto.

**Cenário 4: lista wishlist priorizada.**

```yaml
# .context/stacks/manifest.yaml
wishlist:
  - { library: "drizzle-orm", version: "0.33.0", hint: "ORM alternativo a Prisma para avaliação" }
  - { library: "trpc", version: "11.0.0" }
```

`devflow stacks scrape-batch --from-manifest`

Lê wishlist, scraping batch das duas libs. Útil para "rodar overnight" antes de decisão arquitetural.

### 3.4.4 Confidence scoring detalhado

A confidence é calculada por estratégia e agregada por max():

| Sinal | Confidence base | Boost |
|---|---|---|
| Registry tem homepage E repository | 0.85 | +0.05 se homepage e repository batem (mesmo domínio/org) |
| llms.txt 200 OK no homepage | 0.95 | +0.03 se llms.txt referencia versão exata |
| GitHub `docs/` existe na tag versão | 0.90 | +0.05 se README.md tem link para `docs/` |
| docs-site sitemap.xml com URLs `/docs/` | 0.75 | +0.05 se sitemap declara versão |
| web_search via Claude | 0.40-0.85 | depende de quão consistentes são os top-5 resultados |
| Heurística por convenção (`docs.<lib>.io`) | 0.50 | sem boost — é último recurso |

Confidence **< 0.6** marca a lib como `INCERTA`. Humano **deve** resolver via `edit` antes de prosseguir — comando recusa rodar com incertas.

Confidence **0.6-0.8** é apresentada normalmente mas com aviso visual (`⚠`) sugerindo revisão.

Confidence **≥ 0.8** é apresentada como recomendação confiável (`✓`).

## 3.5 `devflow stacks scrape` — comando primitivo single-lib

Versão simplificada de `scrape-batch` para 1 library com fonte conhecida. Útil quando dev já decidiu a fonte (ex.: descobriu manualmente o link da doc) e quer pular a fase de discovery.

```text
devflow stacks scrape <library> <version>
  --source=github|docs-site|local
  --from=<url|repo|path>
  [--mode=create|refresh|validate]
  [--dry-run]
```

Equivalente a `scrape-batch` com 1 lib + fonte forçada (pula Fase B). Mais rápido (~5-10s economizados na descoberta), mas requer dev saber a fonte exata.

`--mode` controla comportamento se arquivo já existe:

- `create` (default): falha se `refs/<lib>@<version>.md` já existe
- `refresh`: sobrescreve, gera novo hash, commit como "refresh"
- `validate`: não regera, apenas valida que arquivo existente passa nos sanity checks (≥5 snippets, headers presentes, hash bate com `.lock`)

Caso de uso real: refresh trimestral agendado via cron + Slack notification.

## 3.6 Skill `devflow:scrape-stack-batch` — estrutura

A implementação dos comandos `scrape-batch` e `scrape` vive em uma skill devflow no path `/mnt/skills/user/scrape-stack-batch/`. Estrutura mínima de arquivos:

```text
scrape-stack-batch/
├── SKILL.md                      # frontmatter + descrição + workflow
├── scripts/
│   ├── discovery.mjs             # Fase B: registry/llms.txt/web_search
│   ├── pipeline.mjs              # Fase D: 4 estágios RESOLVE/SCRAPE/REFINE/CONSOLIDATE
│   ├── confidence.mjs            # scoring lógica
│   └── input-resolver.mjs        # Fase A: package.json, manifest wishlist, args
├── templates/
│   ├── confirmation-prompt.txt   # template do prompt humano
│   └── error-prompt.txt          # template de erro interativo
└── tests/
    ├── discovery.test.mjs        # mocks de registry/llms.txt/web
    └── pipeline.test.mjs         # smoke test com lib pequena
```

**SKILL.md** propõe (frontmatter no padrão skill-creator):

```yaml
---
name: scrape-stack-batch
description: Descobre fonte oficial de docs e gera artisanalRef para múltiplas libraries via pipeline docs-mcp-server + md2llm. Usado quando dev quer adicionar libs novas ao manifest, fazer setup inicial via package.json, ou refresh em batch.
version: 0.1.0
deps:
  external:
    - "@arabold/docs-mcp-server@^2.0.3"
    - "md2llm@^1.0.0"
  internal:
    - devflow:adr-builder@^0.14.0
trigger_phrases:
  - "scrape stack"
  - "scrape-batch"
  - "gerar refs"
  - "atualizar stacks"
  - "refresh stack"
---
```

**Workflow descrito em SKILL.md** (resumo, não pseudocódigo):

1. Detectar modo de input (`--from-package` / `--from-manifest` / args / wishlist)
2. Para cada stack, invocar `discovery.mjs` (Fase B)
3. Apresentar plano consolidado, prompt humano (Fase C)
4. Se confirmado, invocar `pipeline.mjs` em paralelo (Fase D)
5. Em caso de falha, prompt humano com 5 opções (`retry`/`retry-alt`/`skip`/`abort`/`edit`)
6. Após sucesso, atualizar `manifest.yaml` com fontes confirmadas, gerar commit final

A skill respeita a `REGRA GERAL DE EXECUÇÃO` do projeto NXZ — sempre apresenta plano antes de qualquer write action.

## 3.7 Lifecycle do `artisanalRef` ao longo do projeto

**Refresh manual.** Trigger: dev decide upgrade de lib. Ação: `devflow stacks scrape <lib> <new-version> --mode=refresh`. Resultado: novo arquivo `<lib>@<new-version>.md`, manifest atualizado, ADR de upgrade.

**Drift detection automática.** Job nightly em CI compara `package.json` (versões instaladas) com `manifest.yaml` (`artisanalRef` pinados):

```typescript
// Pseudocódigo do drift detection job
const installed = parseLockfile("package-lock.json");
const pinned = parseManifest(".context/stacks/manifest.yaml");

for (const [lib, installedVersion] of Object.entries(installed)) {
  const pinnedVersion = pinned[lib]?.version;
  if (!pinnedVersion) continue;  // lib não pinada, OK

  if (majorVersionDiff(installedVersion, pinnedVersion)) {
    openIssue({
      title: `Stack drift: ${lib} installed=${installedVersion} pinned=${pinnedVersion}`,
      body: `Run: devflow stacks scrape ${lib} ${installedVersion} --mode=refresh`,
      labels: ["stack-drift", "context-layer"]
    });
  }
}
```

**Deprecation manual.** Trigger: lib removida do projeto. Ação: dev edita manifest (remove entry), `git rm .context/stacks/refs/<lib>@<version>.md`. Audit trail preservado em git history. ADR de remoção opcional (ato informacional).

**Coexistência durante transição.** Quando dev faz upgrade `next 15 → 16`, manifest pode declarar **dois artisanalRefs** temporariamente:

```yaml
frameworks:
  next:
    version: "16.0.0"
    artisanalRef: refs/next@16.0.0.md       # primário
    legacyRefs:
      - refs/next@15.0.0.md                  # mantido durante migração
    legacyValidUntil: "2026-08-01"           # depois disso, remover
```

`context-filter.mjs` carrega ambos durante o período, com snippets do primário ganhando boost de confidence. Depois de `legacyValidUntil`, drift detection alerta para limpar.

**Storage e tamanho cumulativo.** Para projeto NXZ típico (5-10 libs core, ~3 anos de evolução com ~2 majors/lib), estimativa de espaço em git:

- Por arquivo `.md`: 50-300KB
- 10 libs × 6 versões em history = 60 arquivos
- Total cumulativo: ~10-15MB em git history

Aceitável. Para comparação, `node_modules/.cache/` típico de projeto Next.js é 200-500MB.


# 4. Processo de validação — Semana 0 + 5 fases (calibradas)

A Semana 0 (§4.6) é pré-requisito — migra o path do `adr-builder` antes que as 5 fases comecem. As fases continuam espelhando o PREVC, agora aplicadas aos **4 gaps reais** (standards, stacks, permissions, observability), não 5. Cada fase tem entrada, saída, comando devflow, hooks ou skills invocados, e critérios de aceitação falsificáveis.

## 4.1 Fase 1 — Audit (descoberta do estado atual)

**Objetivo.** Inventariar o `.context/` existente, classificar cada artefato em uma das 6 dimensões de harness, identificar gaps em relação às 4 extensões pendentes.

**Entrada.** Repositório com `.context/` já gerado por `dotcontext init` ou `/devflow init`.

**Saída.** `.context/.devflow/audit-report.md` (gitignored por default).

**Comando.**

`devflow context audit [--strict] [--format=md|json]`

**O que invoca.**

- Skill `devflow:adr-builder` em modo AUDIT para todos os ADRs em `.context/adrs/` (com dual-read em legacy `.context/docs/adrs/` durante v0.14 e v0.15)
- Skill `devflow:adr-filter` para classificar ADRs por categoria
- Helper `scripts/detect-project-stack.sh` para detectar stack
- Lê `.context/.devflow.yaml` para parâmetros de projeto

**Algoritmo de classificação** (em prosa, sem aninhar bloco markdown):

A função de classificação varre `.context/` e atribui cada arquivo a uma de 6 dimensões: memory, skills, agents, control, adr, ou unclassified. Para cada uma das 4 extensões pendentes, marca status como MISSING, PARTIAL ou OK:

- **standards**: OK se existe `.context/standards/` com pelo menos 1 standard tendo linter associado; PARTIAL se existem regras espalhadas em ADRs Layered/SOLID/OWASP mas sem pasta dedicada; MISSING se nenhum sinal.
- **stacks_pinned**: OK se existe `.context/stacks/manifest.yaml` com `artisanalRef` válido para cada framework E os arquivos `.context/stacks/refs/<lib>@<version>.md` existem; PARTIAL se manifest existe mas faltam refs scrapeados; MISSING se nenhum sinal.
- **permissions**: OK se existe `.context/permissions.yaml` no formato deny→allow→mode→callback; PARTIAL se há git-strategy hook ativo mas sem gramática portável; MISSING se nenhum sinal.
- **observability**: OK se existe `.context/observability.yaml` configurado e habilitado; PARTIAL se existe arquivo mas `enabled: false`; MISSING se arquivo não existe.

Audit também detecta "ADRs disfarçados em docs livres": busca em `.context/docs/` (excluindo `adrs/`) por arquivos com pattern `(decision|rfc|architecture-)` e sugere migração para o adr-builder.

**Critérios de aceitação.**

- [ ] `audit-report.md` lista 100% dos arquivos de `.context/` em alguma dimensão
- [ ] Cada gap tem `status` em MISSING / PARTIAL / OK justificado por evidência
- [ ] ADRs candidatos detectados em `docs/` listados com path e título sugerido
- [ ] Relatório recomenda priorização (default: standards → stacks → permissions → observability)
- [ ] Skill `adr-builder` em modo AUDIT roda sem erro nos ADRs existentes
- [ ] Helper `detect-project-stack.sh` retorna stack identificável (py/ts/go/rust ou unknown)

**Anti-pattern a evitar.** Audit não deve sugerir mover arquivos do dotcontext para devflow nem o inverso. Cada artefato fica onde está; o relatório só **recomenda** novas adições.

## 4.2 Fase 2 — Spec (proposta de extensões)

**Objetivo.** Para cada gap em status MISSING ou PARTIAL, gerar uma proposta concreta — incluindo o ADR que justifica a adoção da extensão (via `adr-builder`), os schemas de validação e os pontos de integração com os hooks devflow existentes.

**Entrada.** `audit-report.md` da fase anterior.

**Saída.** `.context/.devflow/proposal/`:

- `adrs/` — ADRs propostos via `adr-builder` em modo CREATE, status `Proposto`
- `manifests/standards.yaml` — schema proposto da pasta standards
- `manifests/stacks.yaml` — stack manifest detectado e propostos `artisanalRef` para cada library
- `manifests/permissions.yaml` — gramática proposta deny-first
- `manifests/observability.yaml` — config OTel template
- `migration-plan.md` — passos para fase 3, em ordem topológica

**Comando.**

`devflow context spec [--from=audit-report.md]`

**O que invoca.**

- Skill `devflow:adr-builder` em modo CREATE para gerar 4 ADRs propostos (1 por extensão)
- `dotcontext context.scaffoldPlan` para criar plan PREVC rastreando a adoção
- `dotcontext plan.link` para conectar o plan ao audit-report

**Os 4 ADRs propostos pela fase 2.** Cada um sai com `status: Proposto`, `version: 0.1.0`, `supersedes: []`, `decision_kind: firm`. O autor humano completa Drivers (se ≥3 forças) e summary opcional.

**ADR-0001 — Adotar standards com tripla camada.** Frontmatter:

```yaml
type: adr
name: adopt-standards-triple-layer
description: Standards em 3 camadas (Markdown + LLM rules + linter executável)
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Proposto
version: 0.1.0
created: 2026-05-04
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Standards vivem em .context/standards/, com Markdown para humanos, regras LLM-readable embutidas e ao menos 1 linter por standard executado em PostToolUse."
```

**ADR-0002 — Stack docs via pipeline artesanal (`docs-mcp-server` CLI + md2llm).** Frontmatter:

```yaml
type: adr
name: stack-docs-artisanal-pipeline
description: stacks/manifest.yaml com artisanalRef apontando para .md scraped por docs-mcp-server CLI + md2llm, lido via filesystem no PreToolUse
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 0.1.0
created: 2026-05-04
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Pipeline artesanal (docs-mcp-server CLI headless + md2llm) gera .context/stacks/refs/<lib>@<version>.md versionado em git, lido via filesystem no PreToolUse com filtragem semântica via context-filter.mjs. Sem dependência SaaS, sem rate limits, replay determinístico via hash do .md."
```

**ADR-0003 — Permissions vendor-neutral.** Frontmatter:

```yaml
type: adr
name: permissions-vendor-neutral
description: gramática deny-first portável entre Claude Code, Cursor, Codex
scope: organizational
source: local
stack: universal
category: seguranca
status: Proposto
version: 0.1.0
created: 2026-05-04
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ".context/permissions.yaml em ordem deny → allow → mode → callback; git-strategy hook continua para Claude Code, mas a gramática é a fonte de verdade."
```

**ADR-0004 — Observability OTel.** Frontmatter:

```yaml
type: adr
name: observability-otel-genai
description: spans gen_ai.* + devflow.* extension namespace, opt-in via observability.yaml
scope: organizational
source: local
stack: universal
category: infraestrutura
status: Proposto
version: 0.1.0
created: 2026-05-04
supersedes: []
refines: []
protocol_contract: null
decision_kind: gated
summary: "Telemetria opt-in seguindo OTel GenAI semconv; reproducibility token em todo span; conteúdo (prompts/completions) só com env var explícita."
```

Note `decision_kind: gated` no ADR-0004 — telemetria mexe com privacidade e custo, decisão fica em portão de revisão futura quando time avaliar custo real.

**Crítico: spec gera ADRs propostos, não aceitos.** Hard Rule #5 do `adr-builder`: status `Aprovado` é ato humano, nunca automático. Transição `Proposto → Aprovado` requer revisão humana — gate da fase 3.

**Critérios de aceitação.**

- [ ] 4 ADRs propostos existem em `.context/.devflow/proposal/adrs/`
- [ ] Cada ADR passa pelo `adr-builder` AUDIT mode com 11/11 PASS ou apenas FIX-AUTO pendente
- [ ] Plan PREVC criado via dotcontext linkado ao audit-report
- [ ] `migration-plan.md` lista comandos shell concretos para fase 3
- [ ] Cada ADR proposto tem ao menos 2 alternativas + 2 guardrails + 1 enforcement (Hard Rule #1 do adr-builder)

## 4.3 Fase 3 — Implement (aplicar extensões)

**Objetivo.** Materializar as propostas aceitas. Esta fase é gated por aprovação humana dos ADRs (transição `Proposto → Aprovado`).

**Entrada.** `proposal/` da fase anterior, com pelo menos os ADRs em `Aprovado`.

**Saída.** Arquivos novos em `.context/`:

```text
.context/
├── adrs/                                  (devflow domain, novo path canônico v0.14)
│   ├── 0001-adopt-standards-triple-layer.md      (Aprovado, movido de proposal/)
│   ├── 0002-stack-docs-artisanal-pipeline.md       (Aprovado)
│   ├── 0003-permissions-vendor-neutral.md        (Aprovado)
│   └── 0004-observability-otel-genai.md          (Aprovado, decision_kind: gated)
├── standards/
│   ├── README.md                          (como autorar standards)
│   └── machine/                           (vazio inicialmente; preenchido sob uso)
├── stacks/
│   ├── manifest.yaml                      (detectado de package.json/pyproject)
│   ├── refs/                              (vazio; preenchido sob demanda)
│   └── llms.txt                           (gerado a partir do manifest)
├── permissions.yaml                       (template deny-first)
├── observability.yaml                     (template OTel mínimo, enabled: false)
└── .lock                                  (gerado: content hashes)
```

**Comando.**

`devflow context apply [--proposal-dir=.context/.devflow/proposal] [--dry-run]`

**O que invoca.**

- `dotcontext plan.updatePhase` — avança o plan PREVC para fase Execution
- `dotcontext plan.recordDecision` — finaliza decisões aprovadas
- `dotcontext plan.commitPhase` — git commit ao final
- `dotcontext sync.exportRules` — re-exporta regras (incluindo agora standards e permissions)

**Detecção automática de stacks.** Devflow, na fase 3, detecta o stack do projeto e propõe **fonte de scrape** para cada lib (via skill `devflow:scrape-stack`). A tabela abaixo mostra os mappings padrão (extensível via `.devflow.yaml`):

| Sinal detectado | Library inferida | Fonte de scrape sugerida |
|---|---|---|
| `package.json` com `react: "^19"` | React 19 | GitHub raw: `vercel/react/main/docs/` |
| `package.json` com `next: "^15"` | Next.js 15 | GitHub raw: `vercel/next.js/v15.0.0/docs/` |
| `package.json` com `prisma: "^5"` | Prisma 5 | docs-site: `https://www.prisma.io/docs/` (via `docs-mcp-server fetch-url`) |
| `pyproject.toml` com `fastapi` | FastAPI | docs-site: `https://fastapi.tiangolo.com/` |
| `pyproject.toml` com `pydantic` | Pydantic | GitHub raw: `pydantic/pydantic/main/docs/` |
| `requirements.txt` com `django` | Django | docs-site: `https://docs.djangoproject.com/en/5.0/` |
| `Cargo.toml` com `tokio` | Tokio | docs-site: `https://docs.rs/tokio/latest/tokio/` |
| `go.mod` com `gin` | Gin | GitHub raw: `gin-gonic/gin/master/docs/` |

Fontes sugeridas são **propostas** — devflow rodaria `devflow stacks scrape <lib> <version> --from <fonte>` uma vez na fase 3 para gerar o `<lib>@<version>.md` em `.context/stacks/refs/`. Usuário aprova versão e fonte antes da skill rodar.

**Critérios de aceitação.**

- [ ] `--dry-run` mostra exatamente o que seria criado sem efeitos colaterais
- [ ] Sem `--dry-run`, todos os arquivos listados acima existem após execução
- [ ] `devflow context audit` re-executado retorna zero gaps em status MISSING
- [ ] `npx dotcontext` continua funcionando (não-invasão verificada)
- [ ] `/devflow init` em projeto novo continua funcionando (smoke test do plugin)
- [ ] `plan.commitPhase` foi chamado e há commit git correspondente
- [ ] `.context/.lock` tem hash de cada arquivo gerado
- [ ] `dotcontext sync export` re-rodado gera AGENTS.md sem regressão

## 4.4 Fase 4 — Verify (validação estática)

**Objetivo.** Verificar que tudo gerado em Implement é estruturalmente válido, internamente consistente, e que bindings com filesystem e dotcontext funcionam.

**Entrada.** `.context/` populado pela fase 3.

**Saída.** Exit code 0 ou relatório detalhado de falhas.

**Comando.**

`devflow context verify [--strict] [--include=schema,stacks,dotcontext,permissions,adr]`

**Verificações realizadas:**

```text
1. Schema validation
   ├── manifest standards.yaml valida contra json-schema
   ├── todo standard em standards/ tem applyTo glob válido
   ├── todo standard tem ao menos 1 linter associado OU emite warning weak-standard
   ├── stacks/manifest.yaml tem version semver e artisanalRef para cada framework
   ├── permissions.yaml respeita ordem deny → allow → mode → callback
   └── observability.yaml valida atributos OTel

2. ADR integrity (delegado para adr-builder AUDIT mode)
   ├── todos os 4 ADRs novos passam 11/11 checks
   ├── frontmatter completo (incluindo summary se opt-in)
   ├── seção Drivers presente apenas se ≥3 bullets
   └── ADR-0004 (observability) confirma decision_kind: gated

3. Cross-reference integrity
   ├── ADR.refines aponta apenas para ADRs existentes
   ├── ADR.supersedes implica ADR alvo está em Substituido
   ├── standards.relatedAdrs aponta para ADRs existentes
   ├── stacks.refs apontam para arquivos existentes em stacks/refs/
   └── permissions.allow.tool apenas tools existentes em mcp.json

4. Stack refs filesystem test
   ├── para cada framework em stacks/manifest.yaml com artisanalRef
   │   ├── arquivo .context/stacks/refs/<artisanalRef> existe
   │   ├── arquivo tem tamanho > 1KB (sanity check)
   │   ├── arquivo contém ao menos 5 blocos de código (smoke test md2llm)
   │   └── grava hash sha256 em .lock
   └── falha se artisanalRef declarado mas arquivo ausente

5. Dotcontext compatibility
   ├── chama dotcontext context.check via MCP — deve retornar OK
   ├── chama plan.getStatus para o plan da fase 2 — deve retornar Aprovado
   └── confirma que sync.exportRules não falhou (warnings OK)

6. Devflow plugin compatibility
   ├── /devflow init em projeto temporário cria .context/ sem erro
   ├── adr-builder skill carrega sem erro
   ├── adr-filter skill detecta stack
   └── session-start hook injeta CONTEXT_INDEX sem erro

7. Permissions sanity
   ├── deny lista arquivos sensíveis: .env*, .ssh/**, secrets/**
   ├── allow lista é não-vazia
   ├── nenhum allow override de deny detectado
   └── git-strategy hook continua compatível com permissions.yaml
```

**Falhas comuns e correções automáticas:**

| Falha detectada | Correção automática? | Ação manual necessária |
|---|---|---|
| ADR sem frontmatter completo | parcial: scaffold via adr-builder FIX-AUTO | preencher `deciders` |
| `artisanalRef` declarado mas arquivo ausente | sim: roda `devflow stacks scrape` | revisar versão e fonte |
| `permissions.yaml` sem deny básico | sim: adiciona deny padrão | — |
| Standard sem linter | não: ambíguo demais | escolher linter ou aceitar weak-standard |
| `applyTo` glob não bate nenhum arquivo | não: warning | rever escopo |
| ADR-0004 com `decision_kind: firm` | sim: ajusta para `gated` | — |

**Critérios de aceitação.**

- [ ] Exit code 0 com `--strict`
- [ ] Todos os `artisanalRef` apontam para arquivos existentes em `stacks/refs/`
- [ ] `plan.getStatus` retorna o plan correto e em estado coerente
- [ ] Nenhum ADR órfão (referenciado mas inexistente)
- [ ] Permissions têm denies de segurança básica
- [ ] Plugin devflow continua funcional em Claude Code

## 4.5 Fase 5 — Continuous (validação em runtime)

**Objetivo.** Garantir que cada chamada LLM através do devflow respeita a context layer estabelecida — em runtime, em todo PR.

**Entrada.** `.context/` validado nas fases 1–4.

**Saída.** Eventos OTel emitidos para cada operação (se opt-in); PRs bloqueados se context layer divergir.

**Mecanismos.**

**5.a. SessionStart hook minimalista.** Hoje injeta `<ADR_GUARDRAILS>`. Estende para apenas 2 cargas (não 4 como na v1 deste plano — ver §2.2 para racional):

```typescript
// pseudocódigo do session-start hook minimalista
async function sessionStart() {
  // PERMISSIONS_DIGEST — sempre aplica
  const perms = readYaml(".context/permissions.yaml");
  inject("<PERMISSIONS_DIGEST>", { deny: perms.deny, mode: perms.mode });

  // CONTEXT_INDEX — Stage-1 only (IDs + summaries, sem corpos)
  const adrIndex = await loadAdrIndex();           // [{id, title, summary, applyTo, status}]
  const stdIndex = await loadStandardsIndex();      // [{id, description, applyTo}]
  const stackIndex = readYaml(".context/stacks/manifest.yaml").frameworks;
  inject("<CONTEXT_INDEX>", {
    adrs: adrIndex.filter(a => a.status === "Aprovado"),
    standards: stdIndex,
    stacks: stackIndex
  });

  // OTel root span (opt-in)
  if (otelEnabled) {
    span.setAttributes({
      "gen_ai.conversation.id": sessionId,
      "devflow.context.session_start.adrs_indexed": adrIndex.length,
      "devflow.context.session_start.standards_indexed": stdIndex.length,
      "devflow.context.session_start.stacks_indexed": stackIndex.length,
      "devflow.context.session_start.tokens_loaded": estimateTokens([perms, adrIndex, stdIndex, stackIndex])
    });
  }
}
```

**5.b. PreToolUse hook com filtragem semântica.** Aplica permissions, filtra ADRs/standards/stacks pela task lendo do filesystem. Lib `context-filter.mjs` é invocada direto (síncrona, sem skill, sem chamadas externas):

```typescript
// pseudocódigo do PreToolUse hook (Stage-2 disclosure)
import { filterAdrs, filterStandards, filterStacks, injectIntoContext } from "./lib/context-filter.mjs";

async function preToolUse(event) {
  // 1. Permission check (deny-first, sempre)
  const decision = checkPermissions(event, ".context/permissions.yaml");
  if (decision === "deny") return { permissionDecision: "deny" };

  // 2. Filtragem semântica (apenas Edit/Write)
  if (event.tool === "Edit" || event.tool === "Write") {
    const ctx = {
      filePath: event.path,
      taskKeywords: extractKeywords(event.prompt),
      projectStack: detectStack(),
      topN: 5
    };

    const adrs = filterAdrs(ctx);
    const standards = filterStandards(ctx);
    const stacks = filterStacks(ctx);  // lê de .context/stacks/refs/<artisanalRef>

    // Stage-2: corpos completos dos artefatos filtrados
    inject("<ADR_FOR_TASK>", injectIntoContext([adrs], "ADR"));
    inject("<STANDARDS_FOR_TASK>", injectIntoContext([standards], "STANDARD"));
    inject("<STACK_FOR_TASK>", injectIntoContext([stacks], "STACK"));

    // 3. Warning se artisanalRef declarado mas arquivo ausente
    for (const stack of stacks.warnings) {
      console.warn(`Stack ref missing: ${stack.name}@${stack.version}; rode "devflow stacks scrape ${stack.name} ${stack.version}"`);
    }

    // 4. OTel attributes
    if (otelEnabled) {
      span.setAttributes({
        "devflow.context.adrs_filtered_in": adrs.included.map(a => a.id),
        "devflow.context.adrs_filtered_out_count": adrs.excluded.length,
        "devflow.context.standards_filtered_in": standards.included.map(s => s.id),
        "devflow.context.stacks_filtered_in": stacks.included.map(s => s.id),
        "devflow.context.stacks_refs_missing": stacks.warnings.length,
        "devflow.context.tokens_loaded": adrs.totalTokens + standards.totalTokens + stacks.totalTokens,
        "devflow.context.tokens_budget_status": "under"  // sempre "under" em v0.14
      });
    }
  }

  return { permissionDecision: "allow" };
}
```

**5.c. PostToolUse hook estendido.** Hoje atualiza napkin. Estende para rodar computational sensors quando arquivo editado tem standard aplicável:

```typescript
async function postToolUse(event: ToolUseEvent) {
  // Napkin update (já existe)
  await napkin.update(event);

  // NOVO: computational sensors para o standard aplicável
  if (event.tool === "Edit" || event.tool === "Write") {
    const standards = matchingStandards(event.path);
    for (const std of standards) {
      if (!std.linter) continue;
      const result = await runLinter(std.linter, event.path);
      if (!result.ok) {
        // Positive prompt injection: mensagem do linter inclui correção
        return {
          followUp: {
            type: "warning",
            message: `Standard ${std.id} violated: ${result.message}\n` +
                     `See .context/standards/${std.path} for fix pattern.`
          }
        };
      }
    }
  }

  // OTel span close (opt-in)
  if (otelEnabled) {
    span.setStatus(event.success ? "OK" : "ERROR");
    span.setAttributes({
      "gen_ai.usage.input_tokens": event.usage?.input,
      "gen_ai.usage.output_tokens": event.usage?.output
    });
    span.end();
  }
}
```

**5.d. CI gate.** Pipeline CI roda 3 verificações em todo PR:

1. `devflow context verify --strict` — exit 0 obrigatório
2. `devflow context lock --check` — falha se `.lock` desatualizado
3. `adr-builder` AUDIT mode em todos os ADRs modificados no PR — 11/11 PASS

**5.e. Drift detection.** Job nightly compara versões em `package.json`/`pyproject.toml`/`Cargo.toml` com versões em `.context/stacks/manifest.yaml`. Se major version drift detectada (ex.: `package.json` tem `next: ^16.0` mas manifest está em `next@15.0.0`), abre issue automática "Stack drift: next.js latest=v16.0 pinado=v15.0.0; rode `devflow stacks scrape next 16.0.0` para atualizar".

**5.f. Replay via reproducibility token.** Token computado por chamada LLM como sha256 de `(model_snapshot + params + .lock_hash + tool_definitions_hash)`. Permite replay determinístico.

**Critérios de aceitação.**

- [ ] 100% das chamadas LLM via devflow têm `devflow.repro.token` no span OTel (quando opt-in)
- [ ] CI gate falha se `.lock` divergir do HEAD
- [ ] CI gate falha se algum ADR no PR tem FIX-INTERVIEW pendente
- [ ] Drift detection abre issue dentro de 24h de release de stack pinado
- [ ] Computational sensors rodam em PostToolUse para arquivos com standard aplicável
- [ ] Auditoria de qualquer call em produção pode ser replayada via reproducibility token
- [ ] **SessionStart injeta apenas `PERMISSIONS_DIGEST` + `CONTEXT_INDEX` (Stage-1)**, nunca corpos de ADR/standard
- [ ] **PreToolUse invoca `context-filter.mjs` síncrono** para Edit/Write; latência <100ms p95
- [ ] **OTel span de PreToolUse contém** `devflow.context.{adrs,standards,stacks}_filtered_in/out` e `tokens_loaded`
- [ ] **Lib `context-filter.mjs` é exclusiva** dos hooks; skills `adr-filter`/`standard-filter` chamam a mesma lib via wrapper async para uso interativo
- [ ] **Comando `devflow context filter --explain`** mostra ranking de relevância, motivo de inclusão/exclusão e estimativa de tokens
- [ ] **`tokens_budget_status: "under"`** sempre na v0.14 (sem teto fixo); ativação de gate via `mode: warn-only` é decisão de v0.15+ baseada em dados


---

## 4.6 Semana 0 — Migração de path `.context/docs/adrs/` → `.context/adrs/` (pré-requisito)

**Objetivo.** Migrar o save path canônico do `adr-builder` antes do roadmap das 4 extensões começar. Esta fase é **pré-requisito bloqueante** das fases 1–5: sem ela, o mapa de integração da §2.1 está inconsistente com a realidade da skill, e ADRs gerados pela fase 2 cairiam no path antigo.

**Entrada.** Devflow v0.13.3 instalado, com save path atual `.context/docs/adrs/`.

**Saída.** Devflow v0.14.0 com:
- Save path canônico em `.context/adrs/`
- Dual-read transitório (lê de ambos paths; escreve só no novo)
- ADR de supersedência aprovado e arquivado
- Test suite passando (208 testes existentes + 4 novos para path migration)

**Comando final esperado.**

`devflow context audit` — após Semana 0, audit deve detectar `.context/adrs/` como path correto e marcar `.context/docs/adrs/` (se existir) como legado.

### 3.6.1 Etapas (com gates humanos)

**Etapa M1 — ADR de supersedência** (1 dia, gate humano antes de M2).

Criar ADR via `adr-builder` em modo CREATE. Frontmatter:

```yaml
type: adr
name: adr-path-migration-to-context-root
description: Migrar save path do adr-builder de .context/docs/adrs/ para .context/adrs/
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 0.1.0
created: 2026-05-04
supersedes: [<ID do ADR original que estabeleceu docs/adrs/, se existir>]
refines: []
protocol_contract: null
decision_kind: firm
summary: "Path canônico do adr-builder migra de .context/docs/adrs/ para .context/adrs/ por consistência com outros artefatos devflow; dual-read transitório por v0.14 e v0.15, remoção em v0.16."
```

Drivers (4 forças, justifica seção opcional):
- Consistência com `.context/standards/`, `.context/stacks/`, `.context/permissions.yaml` (todos na raiz)
- Separação clara de domínios: `docs/` é território dotcontext; `adrs/` é território devflow
- Encurtamento de paths em logs e injection
- Compatibilidade transitória sem quebrar projetos existentes

Após revisão humana, transição para `Aprovado`. Hard Rule #5 do `adr-builder` aplica — aprovação é ato humano.

**Etapa M2 — Atualização da skill `adr-builder` (2 dias, requer M1 aprovado).**

Mudanças no `skills/adr-builder/SKILL.md`:

- HARD-GATE no preflight: `SAVE_PATH = .context/adrs/` (era `.context/docs/adrs/`)
- Step 3 (detect ADR number) atualizado para listar do novo path; fallback para legacy path durante dual-read
- 12 ocorrências do path antigo atualizadas

Mudanças em outros artefatos:

- `skills/adr-filter/SKILL.md` — atualizar Step 1 (load ADRs) para dual-read
- `skills/prevc-validation/SKILL.md` — Step 2.6 (ADR Audit Gate) atualizado
- `skills/prevc-planning/SKILL.md` — Step 3.5 (ADR opportunity check) atualizado
- `commands/devflow-adr.md` — atualizar exemplos de path

Bumpa para `v0.14.0` (minor — quebra path canônico mas mantém API; dual-read mitiga).

**Etapa M3 — Atualização dos scripts em `${CLAUDE_PLUGIN_ROOT}/scripts/` (2 dias, paralelo a M2).**

Os 3 scripts ganham helper `resolveAdrPath()`:

```typescript
// scripts/lib/path-resolver.mjs (novo)
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function resolveAdrPath(projectRoot) {
  const newPath = join(projectRoot, '.context', 'adrs');
  const legacyPath = join(projectRoot, '.context', 'docs', 'adrs');

  // Single-write: sempre novo path
  // Dual-read: lê de ambos durante v0.14 e v0.15
  return {
    write: newPath,
    readPaths: [newPath, legacyPath].filter(existsSync),
    isLegacy: existsSync(legacyPath) && !existsSync(newPath)
  };
}
```

Mudanças por script:
- `adr-update-index.mjs` — usa `resolveAdrPath().readPaths` para varrer; escreve em `.write`
- `adr-audit.mjs` — mesma lógica; emite warning `LEGACY_PATH_DETECTED` se `isLegacy`
- `adr-evolve.mjs` — mesma lógica; ao executar evolve, **migra arquivo** do legacy para novo path se aplicável

**Etapa M4 — Atualização do hook `session-start` (1 dia, requer M3).**

`hooks/session-start.sh` (v0.11.0+) carrega `<ADR_GUARDRAILS>` lendo de `resolveAdrPath().readPaths`. Dois ADRs com mesmo ID em paths diferentes → prioriza `.context/adrs/` (novo) e emite warning de duplicata.

Edge case: projeto sem nenhum dos paths → hook emite warning, não falha.

**Etapa M5 — Test suite (2 dias, paralelo a M3-M4).**

Adicionar 4 novos testes em `tests/`:

- `test-adr-path-resolver.mjs` — resolve correctly em 4 cenários: só novo / só legacy / ambos / nenhum
- `test-adr-builder-new-path.mjs` — CREATE em projeto green-field grava em `.context/adrs/`
- `test-adr-builder-dual-read.mjs` — AUDIT em projeto com path legacy detecta ADRs e emite warning
- `test-adr-evolve-migrates.mjs` — EVOLVE em ADR no path legacy move para path novo

### 3.6.2 Riscos identificados e mitigações

| Risco | Mitigação |
|---|---|
| ADRs em projetos existentes ficam órfãos durante upgrade | Dual-read garante leitura do path antigo durante v0.14 e v0.15 |
| `dotcontext sync export` (que regenera AGENTS.md, CLAUDE.md) emite paths errados | Smoke test em CI: `dotcontext sync export` em projeto com path novo deve produzir referências ao path novo |
| Plugins terceiros que assumem `.context/docs/adrs/` quebram | Documentar breaking change no CHANGELOG v0.14; dual-read por 2 minor versions |
| Hook `session-start` falha se nenhum path existe | Fallback gracioso: warn, não erra; injeta `<ADR_GUARDRAILS>` vazio |
| Skill `adr-filter` Step 1 quebra se path muda em runtime | Helper `resolveAdrPath` chamado a cada invocação, não cacheado |
| Confusão entre desenvolvedores sobre qual path usar | Aviso explícito no CHANGELOG + warning `LEGACY_PATH_DETECTED` no `adr-audit.mjs` |

### 3.6.3 Critérios de aceitação

- [ ] ADR de supersedência (M1) em status `Aprovado` antes de qualquer code change
- [ ] v0.14.0 do devflow shipa com dual-read habilitado e save path canônico `.context/adrs/`
- [ ] `adr-builder` CREATE em projeto green-field grava em `.context/adrs/`
- [ ] `adr-builder` AUDIT em projeto com path legacy detecta ADRs e emite warning `LEGACY_PATH_DETECTED`
- [ ] `adr-builder` EVOLVE em ADR no path legacy move para path novo (migração on-write transparente)
- [ ] Hook `session-start` injeta `<ADR_GUARDRAILS>` lendo de ambos paths via `resolveAdrPath()`
- [ ] `npx dotcontext` continua exportando rules sem regressão (smoke test)
- [ ] Test suite passa: 208 testes existentes + 4 novos (212 total)
- [ ] CHANGELOG v0.14 documenta breaking change com instruções de migração

### 3.6.4 Roadmap de remoção do dual-read

| Versão | Comportamento |
|---|---|
| v0.13.x | Path canônico: `.context/docs/adrs/` (atual) |
| **v0.14.0** | Path canônico: `.context/adrs/`. Dual-read ativo. Warning `LEGACY_PATH_DETECTED` em audit. |
| **v0.15.x** | Dual-read ainda ativo. Warning escala para `LEGACY_PATH_DEPRECATED` (mais agressivo). |
| **v0.16.0** | Dual-read **removido**. Apenas `.context/adrs/` é lido. Projetos no path antigo precisam migrar antes do upgrade. |

### 3.6.5 Migração manual de projetos existentes (fora do plano)

Como decisão explícita, migração de ADRs em projetos NXZ que já usam o `adr-builder` é **atividade manual fora deste plano** (poucos projetos em produção hoje). Receita sugerida:

1. `git mv .context/docs/adrs .context/adrs` (preserva histórico)
2. Atualizar referências em outros docs do projeto: `grep -rn "docs/adrs/" .context/` e ajustar
3. Rodar `devflow context audit` para verificar
4. Commit: `chore(adr): migrate path from docs/adrs to adrs (devflow v0.14)`

---

# 5. Reference artifacts (calibrados)

Cada artefato é apresentado em uma única forma quando não há aninhamento, ou em duas partes (frontmatter + corpo) quando contém código aninhado. Em uso real, ficam em arquivo único.

## 5.1 `.context/.devflow.yaml` — extensão do manifest existente

O devflow já usa `.context/.devflow.yaml` para `autoFinish`, `lang` etc. (v0.10.4+). Este plano estende com seções para as 4 novas extensões. Compatível: campos novos são opcionais; ausência preserva comportamento atual.

```yaml
# .context/.devflow.yaml (estendido)
spec: devflow/v1
version: "0.14"                       # alvo após adoção dos ajustes A/B do parecer

# Campos existentes preservados
lang: pt-BR
autoFinish: true
autonomy: supervised                  # supervised | assisted | autonomous

# NOVO: extensões do plano de validação
extensions:
  standards:
    enabled: true
    directory: standards/
    enforcement: required             # required | warn | off
    weakStandardWarning: true         # warning se standard sem linter

  stacks:
    enabled: true
    manifest: stacks/manifest.yaml
    refsDir: stacks/refs/             # output de docs-mcp-server + md2llm
    pipeline: artisanal               # artisanal | (futuro: docs-mcp-server-runtime, hybrid)
    scraper: docs-mcp-server          # ferramenta CLI usada pelo skill scrape-stack
    refiner: md2llm                   # extrai code snippets em formato compacto

  permissions:
    enabled: true
    policy: permissions.yaml
    evaluationOrder: [deny, allow, mode, callback]

  observability:
    enabled: false                    # opt-in explícito; default off
    config: observability.yaml

# NOVO: filtragem semântica de contexto + budget tracking (v0.14)
contextFilter:
  enabled: true                       # filtragem sempre ativa quando hooks rodam
  mode: just-in-time                  # SessionStart minimalista; Stage-2 no PreToolUse
  topN: 5                             # top-N ADRs/standards por filtragem
  scoreWeights:
    applyToMatch: 0.5                 # glob match tem peso maior
    taskKeyword: 0.3                  # match em tags/topics/category
    stackRelevance: 0.15              # stack do projeto bate
    recency: 0.05                     # ADRs mais novos ganham desempate
  tokenObservability:
    enabled: true                     # sempre liga em v0.14 (mesmo sem OTel exporter)
    estimator: tiktoken               # tiktoken | char-approx | wc

# Budget enforcement — roadmap futuro (v0.15+); v0.14 é warn-only inerte
contextBudget:
  mode: warn-only                     # warn-only | soft-drop | hard-fail | disabled
  enabled: false                      # default off em v0.14; opt-in para experimentação
  caps:                               # tetos sugeridos quando ativado (calibrar com dados)
    sessionStart: 5000                # PERMISSIONS_DIGEST + CONTEXT_INDEX
    preToolUse: 12000                 # ADR/standards/stacks filtrados Stage-2
    perTurnTotal: 20000               # soma de todos os hooks no turn
  warnAtPercent: 80                   # emite warning a 80% do cap

# NOVO: contrato de determinismo
determinism:
  pinModel: true
  reproducibilityToken: required
  lockFile: .lock

# NOVO: integração com adr-builder existente
adrIntegration:
  skill: devflow:adr-builder          # já instalado
  template: .context/templates/adrs/TEMPLATE-ADR.md
  savePath: .context/adrs/            # canônico v0.14+ (era docs/adrs/ até v0.13.x)
  summaryField: optional              # ajuste 5.1 do parecer (campo summary)
  driversSection: optional            # ajuste 5.2 do parecer (Drivers)
```

## 5.2 `.context/stacks/manifest.yaml` — stack pinning via pipeline artesanal

```yaml
# .context/stacks/manifest.yaml
spec: devflow-stack/v0
runtime:
  node: "20.11"
  npm: "10.5"

frameworks:
  next:
    version: "15.0.0"
    notes: "App Router; Server Components default; Server Actions para mutations."
    artisanalRef: refs/next@15.0.0.md     # gerado por docs-mcp-server CLI + md2llm
    source:                                # fonte usada pelo skill scrape-stack
      type: github                         # github | docs-site
      repo: vercel/next.js
      path: docs/
      tag: v15.0.0
    applyTo: ["src/app/**", "src/middleware.ts"]
    topics:
      auth: ["middleware", "session", "cookies"]
      data: ["server actions", "fetch", "cache"]
      routing: ["app router", "layouts", "parallel routes"]

  react:
    version: "19.0.0"
    notes: "Hook 'use'; useActionState (não useFormState)."
    artisanalRef: refs/react@19.0.0.md
    source:
      type: github
      repo: facebook/react
      path: docs/
      tag: v19.0.0
    applyTo: ["src/**/*.tsx"]

  prisma:
    version: "5.18.0"
    artisanalRef: refs/prisma@5.18.0.md
    source:
      type: docs-site                      # site renderizado, scrape via docs-mcp-server
      url: "https://www.prisma.io/docs/orm"
      version: "5.18"
    applyTo: ["prisma/**", "src/lib/db/**"]

databases:
  postgres:
    version: "17"
    skipDocs: true                         # APIs estáveis; LLM training data suficiente
    extensions: [pgvector, pg_trgm]

testing:
  vitest:
    version: "1.6.0"
    artisanalRef: refs/vitest@1.6.0.md
    source:
      type: docs-site
      url: "https://vitest.dev/guide/"
      version: "1.6"
    applyTo: ["src/**/*.test.ts", "tests/**/*.ts"]

# Anti-patterns como catalogo first-class
antiPatterns:
  - id: react-class-component
    wrong: "class Foo extends Component"
    right: "function Foo — ou async server component"
    appliesTo: ["react@19"]
  - id: nextjs-pages-router
    wrong: "pages/api/route.ts"
    right: "src/app/api/route/route.ts"
    appliesTo: ["next@15"]
  - id: react-useformstate
    wrong: "useFormState (deprecated React 19)"
    right: "useActionState"
    appliesTo: ["react@19"]

# Configuração do pipeline artesanal
pipeline:
  refiner: md2llm                          # godaddy/md2llm — extrai code snippets
  scraper: docs-mcp-server                 # arabold/docs-mcp-server CLI em modo headless
  scraperMode: cli-fetch-url               # fetch-url single-page; sem SQLite, sem embeddings
  refreshOnDemand: true                    # refresh manual via skill scrape-stack
  missingRefBehavior: warn                 # warn | error | auto-scrape
```

## 5.3 ADR-0002 — Stack docs via pipeline artesanal (gerado pela fase 2, aprovado na fase 3)

Caminho: `.context/adrs/0002-stack-docs-artisanal-pipeline.md`. Gerado pelo `adr-builder` em modo CREATE; após revisão humana, transição para `Aprovado`.

**Frontmatter YAML:**

```yaml
type: adr
name: stack-docs-artisanal-pipeline
description: stacks/manifest.yaml com artisanalRef apontando para .md scraped por docs-mcp-server CLI + md2llm, lido via filesystem no PreToolUse
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
version: 0.1.0
created: 2026-05-04
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Pipeline artesanal (docs-mcp-server CLI headless + md2llm) gera .context/stacks/refs/<lib>@<version>.md versionado em git, lido via filesystem no PreToolUse com filtragem semântica via context-filter.mjs. Sem dependência SaaS, sem rate limits, replay determinístico via hash do .md."
```

**Corpo Markdown** (estilo do template adr-builder, sem blockquote para evitar fence aninhado):

### ADR-0002 — Stack docs via pipeline artesanal

- **Data:** 2026-05-04
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

**Contexto.** Agentes alucinam APIs entre versões major (React 19 vs 18, Next 15 vs 14). Knowledge cutoff do LLM não cobre releases recentes. A v1 deste plano propunha Context7 como fonte de docs em runtime, mas o benchmark documental (`benchmark-context7-vs-artesanal-pt-br.md`) mostrou que pipeline artesanal vence em 4 das 4 métricas avaliadas: latency 70x mais rápido (30ms vs 1.000ms), tokens -33% por chamada, recall estimado +11pp, custo $0 vs $28-108/mês. Adicionalmente, Context7 cortou free tier 92% em jan/2026 e teve vulnerabilidade ContextCrush em fev/2026 — sinais de risco arquitetural do modelo SaaS centralizado.

**Drivers.**
- Determinismo: replay regulatório requer hash estável das docs; SaaS reordena/re-ranqueia entre chamadas
- Latência: 30ms (filesystem) vs 1.000ms (Context7) por chamada de hook
- Custo: $0 vs $28-108/mês para time de 4 devs com uso intenso
- Resiliência: outage SaaS no caminho crítico do PreToolUse hook quebra workflow
- Governance: ContextCrush demonstrou superfície de ataque inerente ao registry centralizado
- Auditoria: cada `.context/stacks/refs/<lib>@<version>.md` versionado em git tem hash estável referenciado pelo `.lock` e pelo reproducibility token

**Decisão.** `.context/stacks/manifest.yaml` declara `artisanalRef: refs/<lib>@<version>.md` apontando para arquivo gerado por pipeline `docs-mcp-server` CLI (modo headless) → `md2llm` → consolidação → commit em git. PreToolUse hook lê o `.md` direto do filesystem via `context-filter.mjs`, aplica filtragem semântica por `applyTo` glob + task keywords. Sem dependência externa em runtime. Bibliotecas ad-hoc não pinadas requerem `devflow stacks scrape <lib> <version>` explícito antes da primeira task — não há fallback automático.

**Alternativas Consideradas.**
- **Context7 SaaS auto-resolve** — rejeitado por custo, latência, accuracy 65%, risco de outage e ContextCrush
- **Context7 como fallback ad-hoc** — rejeitado por manter dependência SaaS no caminho crítico e complexidade de "qual fonte usar"
- **docs-mcp-server como MCP runtime completo** — registrado em §3.7 do benchmark como roadmap futuro; Opção 1 (CLI headless) é mais simples e cobre 100% dos requisitos atuais
- **Sem pinning, sempre latest via Context7** — rejeitado por quebrar reproducibility a cada major release
- **Pipeline artesanal com docs-mcp-server CLI + md2llm** ✓ — escolhido: filesystem read determinístico, custo zero, replay estável, controle total

**Consequências.**

Positivas:
- Latency runtime ~30ms vs 1.000ms do Context7
- Custo recorrente $0 (vs $28-108/mês)
- Replay determinístico via hash em `.lock`
- Sem rate limit, sem dependência SaaS no caminho crítico
- Auditoria limpa: cada doc é blob versionado em git com autor humano explícito

Negativas:
- Manutenção manual: ~2.5h/mês para 5 libs core (vs 0h com SaaS)
- Setup inicial ~2-3h para configurar pipeline (vs 0h com Context7)
- Bibliotecas ad-hoc requerem comando explícito antes da primeira task (vs lookup automático)

Riscos aceitos:
- Lib nova lançada na semana espera próximo refresh manual (mitigação: comando `devflow stacks scrape <lib> <version>` em <3 min quando necessário)
- Doc fica desatualizada até refresh (mitigação: drift detection nightly compara `package.json` vs manifest)

**Guardrails.**
- SEMPRE declarar `artisanalRef: refs/<lib>@<version>.md` para frameworks com `applyTo` cobrindo >5% do código do projeto
- SEMPRE versionar `.context/stacks/refs/*.md` em git (não gitignore)
- NUNCA chamar Context7 ou outro SaaS de docs em hooks runtime
- QUANDO library tem API estável (Postgres, lodash), ENTÃO marcar `skipDocs: true` e omitir `artisanalRef`
- QUANDO scraping fonte oficial não é possível (lib privada sem doc pública), ENTÃO documentar fonte alternativa em `source.notes` e usar input local (filesystem path)

**Enforcement.**
- [ ] Code review: PR que altera framework version major deve incluir refresh do `artisanalRef` correspondente
- [ ] Lint: `devflow context verify --include=stacks` checa que todo `artisanalRef` declarado tem arquivo existente em `stacks/refs/`
- [ ] Teste: smoke test em CI executa `devflow stacks validate` para confirmar que cada `.md` tem ≥5 blocos de código (sanity check md2llm)
- [ ] Gate CI/PREVC: `devflow context drift` falha PR se `package.json` tem versão major diferente do manifest sem ADR de upgrade
- [ ] Hash do `.md` registrado em `.lock` e referenciado pelo reproducibility token

**Evidências / Anexos.**
- Benchmark detalhado: `benchmark-context7-vs-artesanal-pt-br.md`
- Ferramentas: [`docs-mcp-server`](https://github.com/arabold/docs-mcp-server) v2.0.3 · [`md2llm`](https://github.com/godaddy/md2llm) v1.x
- Fonte de inspiração da decisão: análise comparativa em §2.4 do benchmark

## 5.4 `.context/permissions.yaml` — gramática deny-first

```yaml
# .context/permissions.yaml
spec: devflow-permissions/v0
evaluationOrder: [deny, allow, mode, callback]

# Deny é hard — nunca pode ser overridden
deny:
  fs:
    - "**/.env*"
    - "**/.ssh/**"
    - "**/secrets/**"
    - "**/credentials/**"
    - "**/*.pem"
    - "**/*.key"
  exec:
    - "rm -rf /*"
    - "git push --force origin main"
    - "git push --force origin master"
    - "curl * | sh"
    - "wget * | bash"
  net:
    - "169.254.169.254/*"             # cloud metadata endpoints
    - "localhost:*/admin/*"

# Allow lista o que está explicitamente permitido
allow:
  fs:
    read: ["src/**", "tests/**", ".context/**", "docs/**", "*.md"]
    write: ["src/**", "tests/**"]
  exec:
    - "npm run *"
    - "npx *"
    - "git status"
    - "git log *"
    - "git diff *"
    - "git add *"
    - "git commit *"
  tool:
    - "mcp__dotcontext__*"            # todos os tools dotcontext
    - "mcp__mempalace__*"             # memória semântica (se opt-in)

# Modo controla o default para o que não está em deny nem allow
mode: prompt                          # prompt | accept | deny

# Callback opcional para casos complexos
callback:
  url: null                           # se set, devflow consulta endpoint pra decidir

# Compatibilidade com hooks Claude Code existentes
claudeCodeCompat:
  preserveGitStrategyHook: true       # branch protection continua ativo
  preserveBranchProtectionExceptions: true  # auto-memory + napkin (v0.10.9)
```

## 5.5 `.context/observability.yaml` — config OTel mínima (opt-in)

```yaml
# .context/observability.yaml
spec: devflow-observability/v0
enabled: false                        # opt-in explícito

exporter:
  type: otlp
  endpoint: ""                        # ex: http://localhost:4318
  protocol: http/protobuf

semanticConventions:
  genAi: true                         # gen_ai.* attributes
  devflow: true                       # devflow.* extension namespace

sampling:
  default: 1.0                        # 100% dev; reduzir em prod
  errors: 1.0                         # sempre amostra erros

attributes:
  capture:
    - gen_ai.request.model
    - gen_ai.usage.input_tokens
    - gen_ai.usage.output_tokens
    - gen_ai.tool.call.id
    - devflow.repro.token
    - devflow.adrs.loaded             # array de IDs ADR carregados
    - devflow.standards.applied       # array de IDs standard aplicáveis
    - devflow.stacks.refs_loaded      # array de paths .context/stacks/refs/ carregados
    - devflow.permission.decision     # allow | deny | prompt
    - devflow.session.id
  redact:
    - gen_ai.prompt                   # default: não capturar prompt
    - gen_ai.completion               # default: não capturar completion

# Capture de conteúdo é opt-in via env var
contentCapture:
  envVar: OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT
  redactPii: true                     # mesmo se capturar, redige PII
```

## 5.6 Standard exemplo — `.context/standards/error-handling.md`

**Frontmatter YAML:**

```yaml
id: std-error-handling
description: Como erros são lançados, capturados, propagados e reportados
version: 1.0.0
applyTo: ["src/**/*.ts", "src/**/*.tsx"]
relatedAdrs: [ADR-0009-error-handling-strategy]
enforcement:
  linter: standards/machine/eslint-error-handling.js
  archTest: src/__tests__/architecture/error-handling.test.ts
weakStandardWarning: false           # tem linter, não é weak
```

**Corpo Markdown — princípios:**

> 1. **Errors são valores, nunca controlam fluxo** — nunca exceptions para outcomes esperados.
> 2. **Todo error lançado estende `BaseError`** — definido em `src/errors/base.ts`.
> 3. **Errors carregam contexto, não stack traces** — incluir actor, intent, inputs.
> 4. **Domain errors são tipados** — nunca `Error("validation failed")`; lance `ValidationError`.
>
> **Estrutura requerida (TypeScript):**
>
> ```typescript
> import { BaseError } from "@/errors";
>
> export class OrderNotFoundError extends BaseError {
>   readonly code = "ORDER_NOT_FOUND";
>   constructor(orderId: string, ctx: Context) {
>     super(`Order ${orderId} not found`, { orderId, actor: ctx.actor });
>   }
> }
> ```
>
> **Anti-patterns** (errado → certo):
>
> - `throw new Error("not found")` → `throw new OrderNotFoundError(id, ctx)`
> - `try { x } catch { return null }` → capture, faça `logger.error(e)` e re-lance como `ServiceError`
> - `if (err) return res.status(500)` → deixe middleware tratar; lance o error
>
> **Enforcement:**
>
> - Regra ESLint `error-handling/no-raw-error` bloqueia `throw new Error(...)`
> - ArchUnit test asserta que todo módulo de domínio exporta subclasses `*Error` de `BaseError`
> - Mensagens de linter LLM incluem o import corretivo e nome de classe (positive prompt injection)

## 5.7 Esboço de comandos `devflow` para validação de context layer

**`devflow context audit [--strict] [--format=md|json]`** — escaneia `.context/`, classifica artefatos nas 6 dimensões de harness, identifica gaps em standards/stacks/permissions/observability, emite `audit-report.md`. Invoca `adr-builder` AUDIT mode para os ADRs existentes.

**`devflow context spec [--from=audit-report.md]`** — gera `proposal/` com ADRs propostos via `adr-builder` CREATE, manifests templates e migration plan; cria plan PREVC no dotcontext.

**`devflow context apply [--proposal-dir=<dir>] [--dry-run]`** — materializa as extensões em `.context/`. Sem `--dry-run` requer ADRs em status `Aprovado` (Hard Rule #5 do adr-builder).

**`devflow context verify [--strict] [--include=schema,stacks,dotcontext,permissions,adr]`** — verificação estática completa; exit 0 ou relatório de falhas.

**`devflow context lock`** — gera/atualiza `.context/.lock` com content hashes. Pré-requisito para reproducibility tokens.

**`devflow context lock --check`** — falha se `.lock` está stale (use em CI).

**`devflow context drift [--update]`** — compara versões em `package.json`/`pyproject.toml`/`Cargo.toml` com versões em `.context/stacks/manifest.yaml`; sugere `devflow stacks scrape` quando há divergência major.

**`devflow stacks scrape <library> <version> [--source=github|docs-site] [--from=<url|repo>]`** — invoca skill `devflow:scrape-stack` que executa pipeline: `docs-mcp-server` CLI (modo headless) → `md2llm` → consolidação → commit em `.context/stacks/refs/<lib>@<version>.md`. Comando explícito quando dev quer adicionar lib nova ao manifest.

**`devflow stacks validate [<lib>]`** — verifica que todo `artisanalRef` declarado em `manifest.yaml` tem arquivo correspondente em `refs/` e que cada `.md` passa nos sanity checks (≥5 blocos de código, headers TITLE/SOURCE/LANGUAGE/CODE presentes).

**`devflow standards new <id>`** — scaffold de standard com frontmatter + linter placeholder.

**`devflow standards verify [<id>]`** — checa que standard tem linter; emite weak-standard warning se não.

**`devflow context filter --explain "<task>" [--file=<path>]`** — modo "EXPLAIN" para context loading. Mostra ranking de relevância, motivo de inclusão/exclusão e estimativa de tokens dos ADRs/standards/stacks que entrariam no PreToolUse para a task descrita. Não invoca LLM.

**`devflow context budget [--show] [--simulate=<turn-id>]`** — mostra histórico de tokens carregados pelos hooks (lê do OTel ou do `.lock`); `--simulate` recarrega um turn passado mostrando o que seria filtrado com o config atual. Útil para calibrar caps antes de v0.15.

**`devflow context replay <span-id> [--with=<config-yaml>]`** — replay determinístico de um turn passado via reproducibility token + content hashes do `.lock`. `--with` permite testar mudanças de config (ex.: novo `topN`, novo cap) contra histórico real.

**`devflow run "<prompt>" [--via=dotcontext]`** — executa task via dotcontext com toda a camada devflow ativa (permissions, observability, repro token).

**`devflow eval ci-suite`** — roda eval suite mínima de smoke test do harness.

**`devflow doctor`** — diagnóstico geral: verifica MCP server dotcontext acessível, `docs-mcp-server` CLI disponível (`npx @arabold/docs-mcp-server --version`), `md2llm` instalado, permissions sanity, lock consistency, adr-builder skill carregada, **lib `context-filter.mjs` resolvendo sem erro**.

---

# 6. Critérios de aceitação consolidados

Esta seção é o "test plan" da arquitetura. Cada critério é falsificável e deve ser reverificado a cada release do devflow.

## 6.1 Não-invasão (must-have)

| Critério | Como verificar | Falha se |
|---|---|---|
| Devflow só escreve em `.context/adrs/` (path canônico v0.14+); nunca toca `docs/`, `skills/`, `agents/`, `plans/`, `workflow/` do dotcontext | Hook git pre-commit verifica diff por path | Commit do devflow toca paths proibidos |
| `npx dotcontext` continua funcionando após adoção | Smoke test em CI | Comando dotcontext quebra |
| `dotcontext sync export` continua exportando rules consistentes | Diff de export antes/depois da adoção | Export tem regressão |
| `/devflow init` em projeto green-field continua funcionando | Smoke test em CI com projeto temporário | Init falha ou cria estrutura errada |
| Plugin devflow continua compatível com 5 plataformas | Smoke test em Claude Code, Cursor, Codex, Gemini CLI, OpenCode | Alguma plataforma quebra |
| Hooks existentes (SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse) continuam funcionando | Test suite hooks/ passa (208 testes) | Algum teste falha |

## 6.2 Cobertura das 4 extensões

| Extensão | Critério principal | Comando de verificação |
|---|---|---|
| Standards | Todo standard tem ao menos linter associado OU emite `weak-standard` warning | `devflow standards verify` |
| Stacks (pipeline artesanal) | Todo framework do package.json/pyproject.toml tem entry no stack manifest com `artisanalRef` apontando para arquivo existente | `devflow stacks validate` |
| Permissions | Deny inclui pelo menos `.env*`, `.ssh/**`, force-push patterns; git-strategy hook compatível | `devflow context verify --include=permissions` |
| Observability | Todo span emitido tem `devflow.repro.token` quando enabled; default off | OTel collector smoke test |

## 6.3 Compatibilidade com adr-builder existente

| Critério | Como verificar |
|---|---|
| Todos os 4 ADRs novos passam 11/11 checks do adr-builder AUDIT mode | `devflow context verify --include=adr` |
| Hard Rules #1, #5, #11, #12 do adr-builder respeitadas | Test suite |
| Path `.context/adrs/` é o save target (canônico v0.14+; legacy `.context/docs/adrs/` lido via dual-read em v0.14 e v0.15) | Schema validation + smoke test |
| `${CLAUDE_PLUGIN_ROOT}/scripts/` usado para invocar scripts ADR | grep em scripts/ do devflow |
| Ajuste 5.1 (`summary`) é opt-in e não quebra ADRs existentes | Test fixture com ADR sem summary deve passar |
| Ajuste 5.2 (`Drivers`) é opcional e omitido quando ≤2 forças | Test fixture com 2 drivers deve não ter seção |

## 6.4 Determinismo e replay

| Critério | Como verificar |
|---|---|
| Reproducibility token único por combinação `(model, params, .lock hash, tools)` | Eval suite: mesmo input gera mesmo token |
| `.lock` reflete HEAD de `.context/` | `devflow context lock --check` em CI |
| Replay equivalence rate >95% para structured outputs | `devflow eval` com baseline |
| Drift detection abre issue em <24h de release de stack pinado | Job nightly + monitor |

## 6.5 Performance (não bloqueante mas medido)

| Métrica | Target | Tolerância |
|---|---|---|
| `devflow context audit` em projeto típico | <5s | <30s |
| `devflow context verify --strict` | <10s | <60s |
| Latência adicional por chamada LLM (vs sem hooks) | <200ms | <500ms |
| Tempo de scrape inicial por library (one-shot, fora do hook) | <3 min | <10 min |
| SessionStart hook (PERMISSIONS_DIGEST + CONTEXT_INDEX Stage-1) | <300ms | <1s |
| PreToolUse hook (filtragem síncrona via context-filter.mjs) | <100ms p95 | <300ms |
| Lib `context-filter.mjs` em projeto com 50 ADRs + 15 standards | <80ms | <200ms |

## 6.6 Validação semântica e budget de contexto

| Critério | Como verificar | Falha se |
|---|---|---|
| SessionStart injeta apenas `PERMISSIONS_DIGEST` + `CONTEXT_INDEX` | Inspeção de span OTel do SessionStart | Span contém atributo de body de ADR/standard |
| PreToolUse usa `context-filter.mjs` síncrono (não invoca skill) | Trace de chamadas no hook | Skill `adr-filter`/`standard-filter` aparece no stack do hook |
| Filtragem produz `included` + `excluded` com `reason` por item | Output de `devflow context filter --explain` | Algum item sem `reason` ou `score` |
| `tokens_loaded` registrado em todo span de PreToolUse com Edit/Write | Span OTel | Atributo ausente |
| `tokens_budget_status` é `"under"` em v0.14 (sem teto) | Span OTel | Status diferente sem cap configurado |
| Skills `adr-filter`/`standard-filter` (uso interativo) chamam a mesma lib | Code review da skill | Skill duplica lógica de glob/score |
| Cache de filtragem **não** persiste entre invocações de hook | Inspeção de memória | Cache resolve hit em invocação fresca |
| Estimativa de tokens via tiktoken bate dentro de ±5% do real | Test fixture com prompt conhecido | Diff > 5% |
| `devflow context filter --explain` mostra ≥3 ADRs filtrados ou explica por que < 3 | Smoke test em projeto com 30+ ADRs | Output vazio sem justificativa |
| Topo do ranking (`scoreWeights`) prioriza `applyTo` glob match | Test: ADR com applyTo match deve vir antes de ADR só com tag match | Ordem invertida |

# 7. Roadmap revisado — Semana 0 + 4 semanas

Aplicação concreta para um projeto que já usa o devflow + dotcontext. **Semana 0 é pré-requisito bloqueante** — sem ela, o save path do `adr-builder` continua em `.context/docs/adrs/`, inconsistente com o mapa de integração da §2.1.

**Semana 0 — Migração de path (pré-requisito).**

- Aplicar §4.6 (5 etapas: M1 ADR, M2 skill, M3 scripts, M4 hook, M5 testes).
- Output: devflow v0.14.0 com path canônico `.context/adrs/` e dual-read transitório.
- Critério de saída: ADR de supersedência aprovado, test suite verde (212 testes), smoke test com `dotcontext sync export` sem regressão.
- Atividade manual paralela (fora do plano): migrar projetos NXZ existentes que usam o `adr-builder` em produção (poucos hoje).

**Semana 1 — Audit + Spec + ajustes opcionais ADR.**

- Rodar `devflow context audit`. Revisar `audit-report.md` com o time.
- Aprovar ou ajustar `proposal/` com 4 ADRs propostos (standards, stacks, permissions, observability).
- Em paralelo: começar trabalho nos ajustes A e B do `adr-builder` (campo `summary` + seção `Drivers` opcionais) — escopo separado, mas concorrente.
- Marcar todos os 4 ADRs como `Aprovado` antes de fase 3.

**Semana 2 — Standards (extensão 1).**

- Aplicar `devflow context apply --only=standards`.
- Autorar 3 standards iniciais com base em ADRs Layered/SOLID/OWASP existentes:
  - `error-handling.md` com regra ESLint
  - `naming.md` com check leve via grep ou ESLint custom rule
  - `testing.md` com check via vitest config
- Conectar PostToolUse hook para rodar linter quando arquivo editado tem `applyTo` glob match.
- Smoke test: editar arquivo em violação deliberada, ver mensagem do linter chegar ao agent.

**Semana 3 — Stacks + pipeline artesanal (extensão 2).**

- Aplicar `devflow context apply --only=stacks`.
- Detectar stack via `detect-project-stack.sh` + propostas de fonte de scrape (GitHub raw vs docs-site).
- Para cada framework core (5-7 libs), rodar `devflow stacks scrape <lib> <version>` que invoca `docs-mcp-server` CLI + `md2llm` + commit em `.context/stacks/refs/`.
- Validar via `devflow stacks validate` que cada `artisanalRef` aponta para arquivo existente com ≥5 snippets.
- Smoke test: rodar uma task PREVC editando arquivo em `applyTo` glob, verificar via `devflow context filter --explain` que snippets do `<lib>@<version>.md` aparecem no contexto.
- Configurar drift detection nightly comparando `package.json` vs `manifest.yaml`.

**Semana 4 — Permissions + Observability (extensões 3 e 4).**

- Aplicar `devflow context apply --only=permissions,observability`.
- Permissions: começar permissivo (deny apenas as 4 categorias críticas: env, ssh, secrets, force-push).
- Observability: deixar `enabled: false` por default. Se houver requisito de telemetria, configurar exporter local (Jaeger ou Phoenix) e habilitar.
- Estabelecer baseline: tokens/latência/cost/computational-sensor pass rate.
- Validar que git-strategy hook continua ativo e compatível com `permissions.yaml`.

**Marco final — semana 5 (validação).**

- Após Semana 0 + 4 semanas (5 semanas total), `.context/` cobre todas as 12 dimensões (8 do dotcontext+devflow existentes + 4 do plano).
- Path do ADR é `.context/adrs/` em todos os projetos NXZ ativos (Semana 0).
- `devflow context verify --strict` em verde no CI.
- 1-2 ADRs reais auditados em modo AUDIT do adr-builder com 11/11 PASS.
- Drift detection job nightly rodando.
- Time fez retrospectiva: quais standards são úteis, quais permissions disparam falsos positivos, quais ajustes em fase 5 (continuous).

# 8. Anti-patterns a evitar

**1. Confundir standards com ADRs.** ADRs registram **decisões** (por que X foi escolhido sobre Y); standards são **regras vivas** (como o código deve parecer agora). ADR `error-handling-strategy` justifica `BaseError`; standard `error-handling` define como aplicar. Os dois coexistem; Enforcement do ADR aponta para o standard como mecanismo.

**2. Devflow editando arquivos do dotcontext em runtime.** Se precisa modificar conteúdo em `.context/docs/` (que é território dotcontext, distinto de `.context/adrs/` que é devflow), `skills/` ou `agents/`, chame o gateway MCP do dotcontext quando disponível, ou use `dotcontext sync` quando não. Editar diretamente quebra a separação de domínios.

**3. ADR antes de gap audit.** Criar ADRs em `adrs/` sem antes rodar `devflow context audit` resulta em ADRs que duplicam decisões já documentadas. Audit primeiro, depois spec, depois ADR.

**4. Stack manifest sem version pinada.** Pinning `next: latest` é equivalente a não pinar — `devflow stacks scrape` precisa de versão específica para gerar `next@<version>.md`, e drift detection compara contra versão pinada. `latest` quebra reproducibility a cada major release.

**5. Permissions com `allow: ["*"]`.** Equivalente a desabilitar a camada. Se time não está pronto para deny granular, prefira `mode: prompt` com deny mínimo (4 categorias críticas).

**6. Observability captura prompt/completion por default.** Custo + PII. Sempre opt-in via env var `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`, e mesmo assim apenas em dev/staging.

**7. Pular fase Spec.** Tentação de ir direto de Audit para Apply com `--auto-approve`. Funciona uma vez, mas a primeira mudança contestada vai exigir um ADR retroativo — desperdício. Hard Rule #5 do adr-builder bloqueia isso de qualquer jeito.

**8. Pipeline artesanal sem refresh agendado.** Sem ciclo regular de refresh (`devflow stacks scrape` quando lib lança major), os `.md` envelhecem silenciosamente — agent recebe doc de versão desatualizada mesmo com manifest "pinado". Drift detection nightly + alerta quando `package.json` divergir do manifest é o sweet spot. Para libs core, refresh trimestral; para libs estáveis (Postgres, lodash), `skipDocs: true` no manifest.

**9. Standards sem linter executável.** Standard em prosa que ninguém roda em CI vira papel de parede. `weak-standard` warning serve para sinalizar — mas se em 2 sprints o standard não ganhou linter, downgrade para guideline.

**10. SessionStart hook sobrecarregado.** A v2 já corrige isso (§2.2): SessionStart carrega só `PERMISSIONS_DIGEST` + `CONTEXT_INDEX` Stage-1. Tentação de adicionar "só mais um contexto" no SessionStart deve ser resistida. Se vira essencial, vira parte do CONTEXT_INDEX (índice, não corpo).

**11. Pular Semana 0 (path migration).** Tentação de "rodar fase 1 Audit primeiro pra ver onde dá". Mas se Semana 0 não foi executada, o `adr-builder` ainda salva em `.context/docs/adrs/`, e os ADRs propostos pela fase 2 nascem no path antigo — depois precisam ser movidos. Mais barato fazer Semana 0 antes.

**12. Forçar migração de ADRs em projetos legacy durante o upgrade.** Dual-read existe justamente para evitar isso: projetos que ainda usam `.context/docs/adrs/` continuam funcionando em v0.14 e v0.15 sem mover nada. Migração manual fica opcional até v0.16. Pressionar adoção precoce gera bugs.

**13. Filtragem semântica via skill em hook.** Tentação de invocar `adr-filter` skill em PreToolUse para ter "filtragem inteligente". Hook tem latência sub-100ms; skill tem latência de invocação (carregamento + roundtrip) que vira gargalo. **Lib Node compartilhada é a única forma viável**. Skill continua existindo para uso interativo (`/devflow context filter --explain`) onde latência de skill é aceitável.

**14. Definir teto fixo de tokens sem dados.** Tentação de copiar o "5% Stage-1" da Anthropic ou os "10% target" do LangChain como teto absoluto. Sem baseline de quantos tokens projetos NXZ típicos usam, isso é chute. v0.14 trackeia; v0.15+ ativa enforcement com teto calibrado por dados reais. Decisão do teto vira ADR próprio quando chegar.

**15. Cache de filtragem entre invocações de hook.** Tentação de cachear resultado de `filterAdrs` para acelerar PreToolUse subsequente. Mas estado do `.context/` muda (ADR aprovado, standard editado) e cache stale gera bugs sutis. **Sempre re-ler do disco em cada invocação** — filesystem reads de ≤50 arquivos cabem em <50ms síncronos. Se vira gargalo real medido, adicionar cache LRU com invalidação por mtime, não cache global.

**16. Confiar em filtragem semântica sem `--explain` periódico.** Filtragem que parece funcionar pode estar errada de formas sutis (ADR crítico sendo cortado por `applyTo` mal escrito, standard com tag errada nunca sendo selecionado). Rodar `devflow context filter --explain` em 3-5 tasks típicas do projeto a cada release é checagem barata e essencial.

# 9. Próximos passos

Em ordem:

1. **Aprovar este plano** ou pedir ajustes.
2. **Executar Semana 0** (§4.6) — pré-requisito bloqueante. ADR M1 → skill v0.14 → scripts → hook → testes.
3. **Criar o plan PREVC no dotcontext** que rastreia esta adoção (recursão pretendida — o devflow se aplica a si mesmo).
4. **Implementar ajustes A e B no adr-builder** (campo `summary` + seção Drivers opcionais) — escopo separado, paralelo à Semana 1 do roadmap. Pode shipar junto com v0.14 ou em v0.14.1.
5. **Aplicar o roadmap em projeto piloto** antes de generalizar para todos os projetos NXZ.
6. **Capturar lições aprendidas como ADRs** no próprio `.context/adrs/` do projeto piloto, usando `adr-builder` em modo CREATE — dogfooding completo.
7. **Após Semana 5**, decidir se algum ajuste no plano vale virar contribuição upstream para o `vinilana/dotcontext` (ex.: `summary` como convenção de frontmatter, gramática deny-first como spec compartilhada).

A natureza recursiva — usar o harness para documentar a evolução do próprio harness — é intencional: dogfooding é o teste mais honesto possível.

---

## Anexo — diferenças vs v1

| Tópico | v1 (anterior) | v2 (este documento) |
|---|---|---|
| Premissa de relação devflow ↔ dotcontext | Wrapper MCP estrito | Bridge co-instalado (status real) |
| Premissa de implementação | Greenfield | Calibrado contra v0.13.3 real |
| Número de extensões | 5 | 4 (ADR já existe) |
| Path do ADR | `.context/adr/` | `.context/adrs/` (canônico v0.14+; legacy `.context/docs/adrs/` lido via dual-read) |
| Template ADR | Nygard/MADR/Y híbrido | adr-builder existente + 3 ajustes opt (summary, Drivers, path migration) |
| Standards | Pasta separada | Pasta separada (decisão usuário, recusou colapsar) |
| Roadmap | 5 semanas | Semana 0 + 4 semanas (5 total, com migração de path como pré-requisito) |
| Comando `devflow context audit` | Implementação própria | Delega para `adr-builder` AUDIT mode |
| Hooks afetados | Inventados | SessionStart, PreToolUse, PostToolUse (existentes) estendidos |
| Fluxo de chamada | wrapper síncrono | hooks no lifecycle do plugin |
| **SessionStart cargas** | 4 cargas (ADR + standards + stacks + permissions) | **2 cargas: PERMISSIONS_DIGEST + CONTEXT_INDEX (Stage-1 only)** |
| **Filtragem semântica** | Não previsto | **Lib `context-filter.mjs` síncrona, invocada no PreToolUse (Gates 1-4)** |
| **Token budget** | Não previsto | **Observabilidade em v0.14 (sem teto fixo); enforcement futuro pós-dados** |
