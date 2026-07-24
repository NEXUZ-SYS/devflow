// tests/reversa-import/fixtures/make-fixture.mjs
// Monta projetos Reversa sintéticos em tmpdir. NÃO toca o fixture versionado real.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PLAN = `# Reconstruction Plan — fixture

## Tarefas

### Tarefa 01 — infra
Fundações.

### Tarefa 02 — feat-a
**Depende:** Tarefa 01

## Marcos demonstráveis

| Marco | Após | Demo |
|---|---|---|
| M1 | T01 | infra de pé |
| M2 | T02 | feat-a usável |
`;

const SPEC_FULL = `# Spec — feat-a

## Visão
🟢 Feature capturada ao vivo.

## Requisitos
- RN-01: regra de negócio clara.

## Pronto quando
- AC-01: comportamento X observável.

## Detalhes
${"linha de detalhe.\n".repeat(30)}`;

const SPEC_STUB = `# Spec — feat-a

🔴 lacuna: spec não preenchida.
`;

// Formato real do attio: decisão sob heading numerado, NÃO "## D-NN —".
const PARADIGM_ATTIO = `# Decisão de Paradigma & Stack

## 1. Forças que moldam a arquitetura 🟢
Time pequeno, produto amplo.

## 2. Opções de paradigma (trade-offs)
Monólito modular vs. microserviços.

## 5. Decisão — ✅ APROVADA por Fulano (2026-05-31)
Monólito modular orientado a domínio.
`;

// Formato real do attio: pendências sob heading, NÃO bullet "- D-NN:".
const PENDING_ATTIO = `# Decisões pendentes

## D1 — Stack da Tarefa 01 · bloqueia T01
**Status:** ⏳ aguardando.

## D2 — Storage na v1? · afeta T10
**Status:** ⏳
`;

// Formato real dos ADRs do OKR: sem frontmatter, headings fixos.
function adrBody(num, titulo) {
  return `# ADR ${num} — ${titulo}

**Status:** Aceito (inferido retroativamente) 🟡
**Fonte:** introspecção live-preview. Sem Git.

## Contexto

Contexto observado de ${titulo}. 🟢

## Decisão

Decisão tomada sobre ${titulo}. 🟢

## Consequências

- ✅ Consequência positiva.
- ⚠️ Trade-off aceito. 🟡

## Alternativas (inferidas) 🟡

- Alternativa descartada.

🔴 Motivação histórica não verificável (sem Git).
`;
}

const HANDOFF = `---
schemaVersion: 1
generatedAt: 2026-07-22T18:40:00Z
reversa:
  version: "1.2.43"
kind: handoff
producedBy: orchestrator
hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
---

# Handoff para o Agente de Codificação

> Sistema novo em paradigma OO clássico, topologia modernizada.

## ⚠️ Leitura obrigatória primeiro

1. **\`paradigm_decision.md\`** — inegociável.
2. **\`topology_decision.md\`** — inegociável.

## Ordem de leitura recomendada

1. \`paradigm_decision.md\` · 2. \`topology_decision.md\` · 3. \`target_architecture.md\` · 4. \`parity_specs.md\`

## Lista de artefatos produzidos

| Artefato | Produzido por | Status |
|---|---|---|
| \`paradigm_decision.md\` | paradigm_advisor | criado |
| \`topology_decision.md\` | designer | criado |
| \`target_architecture.md\` | designer | criado |
| \`parity_specs.md\` | inspector | criado |

## Bloqueadores para começar a implementação

**Nenhum bloqueador. Pode começar.**

## Itens REFERIDOS À CODIFICAÇÃO

| ID | O quê | Onde vive | Como tratar |
|---|---|---|---|
| **RC-01** | Motor de pontuação | \`core/models/scoring.py\` | Implementar como spec própria testável. → RISK-001 (ALTA) |
| **RC-02** | Gatilhos de recompute | \`bridge/models/\` | Cobrir os 4 eventos. → RISK-004 |

## Próximos passos para o agente de codificação

1. **Internalizar o paradigma**: Active Record idiomático.
2. **Criar os dois addons** com manifesto limpo.

## Notas finais

Onde o risco realmente está: em dois arquivos.
`;

const FEATURE_ALPHA = `@paridade
Funcionalidade: Pontuação
  Cenário: nó folha aceita valor manual
    Dado um nó folha
    Quando informo 0.8
    Então a pontuação é 0.8

  @conformidade
  Cenário: objetivo calcula média ponderada
    Dado um objetivo com dois KRs
    Então a pontuação é a média ponderada
`;

function migrationDoc(kind, producedBy, titulo) {
  return `---
schemaVersion: 1
generatedAt: 2026-07-22T18:40:00Z
kind: ${kind}
producedBy: ${producedBy}
hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
---

# ${titulo}

Conteúdo de ${titulo}. 🟢 Confirmado por introspecção.
Outro ponto. 🟡 Inferido.
`;
}

export function makeReversaFixture({ profile = "green" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `rev-fix-${profile}-`));
  mkdirSync(join(dir, ".reversa"), { recursive: true });
  writeFileSync(
    join(dir, ".reversa", "state.json"),
    JSON.stringify({ version: "1.2.43", project: `fixture-${profile}`, doc_language: "Português", phase: "concluido-especificacao", target: "Demo", completed: [], pending: ["revisao"] }, null, 2),
  );
  writeFileSync(join(dir, ".reversa", "soul.md"), "# Soul\nProjeto sintético.\n");

  if (profile === "forward-real") {
    // Modelado no attio: forward com features, mas decisões no formato real
    // (## N. Decisão, não ## D-NN —) e plano em _plan/implementation-plan.md.
    mkdirSync(join(dir, "_reversa_sdd", "feat-a"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "_decisions"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "_plan"), { recursive: true });
    mkdirSync(join(dir, "_reversa_forward", "001-feat-a"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
    writeFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), SPEC_FULL);
    writeFileSync(join(dir, "_reversa_sdd", "_decisions", "paradigm-decision.md"), PARADIGM_ATTIO);
    writeFileSync(join(dir, "_reversa_sdd", "_decisions", "pending-decisions.md"), PENDING_ATTIO);
    writeFileSync(join(dir, "_reversa_sdd", "_plan", "implementation-plan.md"),
      "# Plano de implementação\n\n## Ordem\n1. T01 infra\n2. T02 feat-a\n");
    writeFileSync(join(dir, "_reversa_forward", "001-feat-a", "requirements.md"),
      "# Requirements feat-a\n- RN-01\n");
    writeFileSync(join(dir, "_reversa_forward", "001-feat-a", "roadmap.md"), "# Roadmap\n- fase 1\n");
    return dir;
  }

  if (profile === "reverse-analysis") {
    // Modelado no OKR pré-migração: artefatos de análise, dirs-módulo,
    // adrs/*.md já formatados, nenhum <feat>/spec.md, sem _reversa_forward/.
    mkdirSync(join(dir, "_reversa_sdd", "adrs"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "mod-a"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "traceability"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "user-stories"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
    writeFileSync(join(dir, "_reversa_sdd", "code-analysis.md"), "# Code Analysis\nintrospecção. 🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "erd-complete.md"), "# ERD\nrelações. 🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "confidence-report.md"), "# Confiança\n~82%. 🟡\n");
    writeFileSync(join(dir, "_reversa_sdd", "inventory.md"), "# Inventário\nmódulos. 🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "revalidation-report.md"), "# Revalidação\n🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "adrs", "0001-decisao-um.md"), adrBody("0001", "Decisão um"));
    writeFileSync(join(dir, "_reversa_sdd", "adrs", "0002-decisao-dois.md"), adrBody("0002", "Decisão dois"));
    writeFileSync(join(dir, "_reversa_sdd", "adrs", "README.md"),
      "# ADRs\n\n| # | Título | Status |\n|---|---|---|\n| [0001](0001-decisao-um.md) | Decisão um | Aceito (inferido) |\n");
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "requirements.md"), "# Requirements mod-a\n- BR-01 regra. 🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "tasks.md"), "# Tasks\n- [ ] **T-01** — scaffold\n");
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "decisions.md"), "# Decisões\n\n## D-01 — Fórmula\n**Decisão:** média ponderada.\n");
    writeFileSync(join(dir, "_reversa_sdd", "traceability", "code-spec-matrix.md"), "# Matrix\n| Elemento | Unit | Cobertura |\n");
    writeFileSync(join(dir, "_reversa_sdd", "user-stories", "gestao.md"), "# US\n\n## US-01 — Criar\n**Como** user, **quero** criar.\n");
    return dir;
  }

  if (profile === "reverse-migration") {
    // Modelado no OKR pós-migração: migration/ com artefatos tipados por kind:,
    // handoff.md canônico, .state.json com o mapa de artefatos, parity_tests/.
    mkdirSync(join(dir, "_reversa_sdd", "adrs"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "mod-a"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "migration", "parity_tests"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "screens"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
    writeFileSync(join(dir, "_reversa_sdd", "code-analysis.md"), "# Code Analysis\nintrospecção. 🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "erd-complete.md"), "# ERD\n🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "adrs", "0001-decisao-um.md"), adrBody("0001", "Decisão um"));
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "requirements.md"), "# Requirements mod-a\n- BR-01. 🟢\n");
    writeFileSync(join(dir, "_reversa_sdd", "migration", "handoff.md"), HANDOFF);
    writeFileSync(join(dir, "_reversa_sdd", "migration", "paradigm_decision.md"),
      migrationDoc("paradigm_decision", "paradigm_advisor", "Decisão de Paradigma"));
    writeFileSync(join(dir, "_reversa_sdd", "migration", "topology_decision.md"),
      migrationDoc("topology_decision", "designer", "Decisão de Topologia"));
    writeFileSync(join(dir, "_reversa_sdd", "migration", "target_architecture.md"),
      migrationDoc("target_architecture", "designer", "Arquitetura Alvo"));
    writeFileSync(join(dir, "_reversa_sdd", "migration", "parity_specs.md"),
      migrationDoc("parity_specs", "inspector", "Specs de Paridade"));
    writeFileSync(join(dir, "_reversa_sdd", "migration", "parity_tests", "01-alpha.feature"), FEATURE_ALPHA);
    writeFileSync(join(dir, "_reversa_sdd", "screens", "inventory.json"),
      JSON.stringify({ screens: [{ id: "s1", name: "form" }] }, null, 2));
    writeFileSync(join(dir, "_reversa_sdd", "migration", ".state.json"), JSON.stringify({
      schemaVersion: 2,
      completedAgents: ["paradigm_advisor", "designer", "inspector"],
      pendingAgents: [],
      currentAgent: { agent: null, status: "complete" },
      pendingDecisions: [],
      auto: false,
      engine: "claude-code",
      reversaVersion: "1.2.43",
      briefPath: "_reversa_sdd/migration/migration_brief.md",
      artifacts: {
        "handoff.md": { hash: "sha256:aaa", producedBy: "orchestrator" },
        "paradigm_decision.md": { hash: "sha256:bbb", producedBy: "paradigm_advisor" },
        "topology_decision.md": { hash: "sha256:ccc", producedBy: "designer" },
        "target_architecture.md": { hash: "sha256:ddd", producedBy: "designer" },
        "parity_specs.md": { hash: "sha256:eee", producedBy: "inspector" },
        "parity_tests/01-alpha.feature": { hash: "sha256:fff", producedBy: "inspector" },
        "screens/inventory.json": { hash: "sha256:ggg", producedBy: "screen_translator" },
      },
    }, null, 2));
    return dir;
  }

  if (profile === "no-anchor") {
    // Degradação: só reconstruction-plan.md, sem handoff nem _plan/.
    mkdirSync(join(dir, "_reversa_sdd"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
    writeFileSync(join(dir, "_reversa_sdd", "inventory.md"), "# Inventário\n🟢\n");
    return dir;
  }

  if (profile === "reverse") {
    // Layout reverse/brownfield: _reversa_forward/ vazio, sem <feat>/spec.md,
    // com artefatos de análise reversa.
    mkdirSync(join(dir, "_reversa_forward"), { recursive: true }); // vazio de propósito
    mkdirSync(join(dir, "_reversa_sdd", "traceability"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "mod-a"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
    writeFileSync(join(dir, "_reversa_sdd", "code-analysis.md"), "# Code Analysis\nintrospecção live-preview.\n");
    writeFileSync(join(dir, "_reversa_sdd", "erd-complete.md"), "# ERD\n...\n");
    writeFileSync(join(dir, "_reversa_sdd", "traceability", "code-spec-matrix.md"), "# Matrix\n");
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "requirements.md"), "# Requirements mod-a\n- RN-01\n");
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "tasks.md"), "# Tasks\n- T-01 scaffold\n");
    return dir;
  }

  // --- forward (green / yellow / red) ---
  mkdirSync(join(dir, "_reversa_sdd", "feat-a"), { recursive: true });
  mkdirSync(join(dir, "_reversa_sdd", "_decisions"), { recursive: true });
  mkdirSync(join(dir, "_reversa_sdd", "_review"), { recursive: true });
  mkdirSync(join(dir, "_reversa_forward", "001-feat-a"), { recursive: true });
  writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
  writeFileSync(join(dir, "_reversa_forward", "001-feat-a", "requirements.md"), "# Requirements feat-a\n- RN-01\n- US-01 (AC-01)\n");

  if (profile === "red") {
    writeFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), SPEC_STUB);
    writeFileSync(join(dir, "_reversa_sdd", "_decisions", "pending-decisions.md"), "# Pendências\n- D-09: definir provider de billing\n");
    writeFileSync(join(dir, "_reversa_sdd", "_review", "final-closure-audit.md"), "# Audit\n- CRITICAL: schema de billing ausente.\n");
  } else if (profile === "yellow") {
    writeFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), SPEC_FULL);
    mkdirSync(join(dir, "_reversa_sdd", "feat-orfa"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "feat-orfa", "spec.md"), SPEC_STUB); // sdd sem forward
  } else {
    writeFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), SPEC_FULL);
  }
  return dir;
}
