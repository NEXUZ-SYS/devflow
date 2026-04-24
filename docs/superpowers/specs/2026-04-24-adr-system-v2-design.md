---
type: spec
name: adr-system-v2-design
description: Design spec — evolução do sistema de ADR do DevFlow para o padrão v2.1.0, com nova skill devflow:adr-builder e integração ativa em prevc-planning, prevc-validation e adr-filter
status: approved
created: 2026-04-24
supersedes: 2026-04-03-adr-system-design.md
scale: MEDIUM
autonomy: supervised
mode: Full
---

# ADR System v2 — Design Spec

> Evolução do sistema de ADR do DevFlow para o padrão v2.1.0 (vindo da skill externa `docs/adr-builder.skill`), adicionando uma skill `devflow:adr-builder` com 3 modos (CREATE, AUDIT, EVOLVE), uma lib Node determinística para auditoria, e integração ativa com 3 skills do PREVC.

## 1. Goals

- Adotar o template ADR v2.1.0 (frontmatter de 13 campos, 7 categorias, 12 Hard Rules) como padrão do DevFlow.
- Entregar uma skill `devflow:adr-builder` que cobre criação, auditoria e evolução de ADRs.
- Estabelecer um gate determinístico em PREVC Validation que audita ADRs tocadas por workflows.
- Migrar as ADRs existentes (`001-tdd-python`, `002-code-review`) para o formato v2.1.0.
- Garantir que testes de integração sejam **reais e determinísticos** (sem mocks; alinhado com `feedback_tdd_always` e ADR 001).

## 2. Non-Goals

- `/devflow adr:bundle` (export/import de ADRs cross-repo) — registrado como plan futuro B1.
- `/devflow adr:audit-all` (reauditoria em massa) — plan futuro B2.
- Geração dos 21 templates organizacionais previstos no plan original `adr-system.md` — esse plan continua valendo para criação de templates; este plan supersede apenas a parte de **integração** com o workflow.
- `/devflow adr:deprecate` standalone — possível via EVOLVE; subcomando dedicado fica como plan futuro B3.
- Integração ADR ↔ MemPalace, ADR ↔ PRD generation, pre-commit hook — plans futuros B4-B6.

## 3. Premissas validadas

| # | Decisão | Aprovada quando |
|---|---|---|
| P1 | Escopo C (skill + template v2 + migração + integração ativa em 3 skills PREVC) | Pergunta 1 |
| P2 | Abordagem 2 (skill conversacional + lib Node executável) | Q approach |
| P3 | Filename com semver completo: `NNN-<slug>-v<major>.<minor>.<patch>.md` (Leitura B) | Q numeração |
| P4 | `supersedes` / `refines` usam filename sem extensão (Opção Y) | Q schema grafo |
| P5 | Migração de 001 e 002 incluída neste plan | Q migração |
| P6 | CREATE e EVOLVE disparam PREVC SMALL; AUDIT roda inline | Q-final-3 = b |
| P7 | Matriz por arquivo (plugin canonical vs projeto substituível) | Q-final-1 |
| P8 | Steps 5.5–7 do pacote enxugados; comando bidirecional `adr:bundle` em plan futuro | Q-final-2 |
| P9 | Schema do README com 14 colunas (opção 3) | Q schema |

## 4. Arquitetura

### 4.1 Componentes

| # | Componente | Localização | Responsabilidade |
|---|---|---|---|
| 1 | Skill `adr-builder` | `skills/adr-builder/SKILL.md` + `references/` + `assets/TEMPLATE-ADR.md` | Conversacional. Modos CREATE (guiado/livre/pré-preenchido) e AUDIT-interactive. Orquestra chamadas à lib. |
| 2 | Lib `adr-audit` | `scripts/adr-audit.mjs` + `scripts/lib/adr-frontmatter.mjs` + `scripts/lib/adr-graph.mjs` | Node executável. 12 checks (11 originais + Check 12 grafo). Output JSON. |
| 3 | Lib `adr-evolve` | `scripts/adr-evolve.mjs` | Orquestra transição patch/minor/major/refine — git mv ou novo arquivo + bump frontmatter + status. |
| 4 | Lib `adr-update-index` | `scripts/adr-update-index.mjs` | Regenera `.context/docs/adrs/README.md` a partir do frontmatter de cada arquivo. |
| 5 | Comando dispatcher | `commands/devflow-adr.md` | Recebe `/devflow adr:<new\|audit\|evolve>` e dispatcha para a skill. |
| 6 | Modificação `prevc-planning` | `skills/prevc-planning/SKILL.md` | Adicionar Step 5.6 — ADR opportunity check (heurística 4-sinais opt-in). |
| 7 | Modificação `prevc-validation` | `skills/prevc-validation/SKILL.md` | Adicionar Step 2.5 — ADR Compliance Check (matriz por status). |
| 8 | Modificação `adr-filter` | `skills/adr-filter/SKILL.md` | Adaptar parser para schema 14-colunas; tags `[firm]`/`[gated]`/`[experimental]`. |

### 4.2 Matriz por arquivo (origem → destino)

| Arquivo | Origem | Destino | Substituível por projeto? |
|---|---|---|---|
| `TEMPLATE-ADR.md` | bundle anexo | `skills/adr-builder/assets/TEMPLATE-ADR.md` | **Não** — contrato imutável (Hard Rule #4) |
| `patterns-catalog.md` | bundle anexo | `.context/templates/adrs/patterns-catalog.md` (seed do bundle) | **Sim** — auto-declarado SUBSTITUÍVEL |
| `context.yaml` | bundle anexo | `.context/templates/adrs/context.yaml` (seed do bundle) | **Sim** — auto-declarado SUBSTITUÍVEL |
| `references/briefing-guiado.md` | bundle anexo | `skills/adr-builder/references/` | **Não** — operação interna da skill |
| `references/extracao-livre.md` | bundle anexo | `skills/adr-builder/references/` | **Não** |
| `references/auditoria.md` | bundle anexo | `skills/adr-builder/references/` | **Não** — define contratos da lib |
| `references/checklist-qualidade.md` | bundle anexo | `skills/adr-builder/references/` | **Não** |
| `references/saida-distribuicao.md` | bundle anexo | descartar (Steps A/C virarão `adr:bundle` futuro) | N/A |
| `tests/audit-fixtures/*` | bundle anexo | `tests/validation/fixtures/adr/` | N/A |
| `tests/smoke.sh` | bundle anexo | descartar (substituído por suítes Node) | N/A |
| `.context/templates/adrs/TEMPLATE-ADR.md` | DevFlow v1 atual | **remover** (template agora vive no bundle) | N/A |
| `001-tdd-python.md`, `002-code-review.md` | DevFlow atual | renomear + migrar formato (ver §7) | N/A |

### 4.3 Diagrama de fluxo — Step 2.5 estendido (V phase)

```
Workflows que chegam em V phase:
  ┌─────────────────────────────────────────────────────────┐
  │ (A) Workflow hospedeiro (feature/bugfix que tocou ADR)  │
  │ (B) /devflow adr:new       → PREVC SMALL dedicado       │
  │ (C) /devflow adr:evolve    → PREVC SMALL dedicado       │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
                   V phase — Step 2.5
                             │
                  git diff .context/docs/adrs/*.md
                             │
                 ┌───────────┴──────────┐
                 ▼                      ▼
              diff vazio             diff com N arquivos
                 │                      │
                 ▼                      ▼
               skip              para cada ADR:
                              ├── Proposto / nova   → adr-audit.mjs --enforce-gate
                              ├── Aprovado editada  → check version bump + audit
                              └── Substituido /     → skip (histórico imutável)
                                  Descontinuado

Fora do fluxo V:
  • /devflow adr:audit  → inline (sem workflow, sem gate)
```

## 5. Modos da skill

### 5.1 CREATE (`/devflow adr:new`)

**Invocação:**
```bash
/devflow adr:new                                  # Submodo escolhido na entrevista
/devflow adr:new "Usar Zod para validação"        # Título inicial
/devflow adr:new --mode=guided|free|prefilled
```

**Workflow:** PREVC SMALL dedicado (P → E → V).

**P phase:**
1. Selecionar submodo (guided | free | prefilled).
2. Coletar conteúdo conforme `references/<submodo>.md` do bundle.
3. Validar campos não-negociáveis (Hard Rules #1, #2): título + decisão, ≥2 alternativas, ≥2 guardrails verificáveis, ≥1 enforcement concreto.
4. Resolver número via `adr-update-index.mjs --next-number`.

**E phase:** TDD (teste RED → write → GREEN), gerar arquivo a partir de `skills/adr-builder/assets/TEMPLATE-ADR.md`, regenerar índice, commit.

**V phase:** `adr-audit.mjs <novo-arquivo> --enforce-gate`. 12/12 PASS → workflow fecha; FIX-INTERVIEW → bloqueia.

### 5.2 AUDIT (`/devflow adr:audit`)

**Invocação:**
```bash
/devflow adr:audit 001
/devflow adr:audit 001-tdd-python-v1.0.0
```

**Workflow:** **inline, sem PREVC**. Diagnóstico puro.

**Fluxo:**
1. Resolver argumento → filename canônico.
2. Rodar `adr-audit.mjs --format=pretty`.
3. Apresentar relatório (PASS / FIX-AUTO / FIX-INTERVIEW por check).
4. Perguntar próximo passo:
   - (a) Apenas ver
   - (b) Corrigir auto-corrigíveis → delega para `adr:evolve` (patch)
   - (c) Corrigir tudo → delega para `adr:evolve` (patch ou minor conforme natureza)

### 5.3 EVOLVE (`/devflow adr:evolve`)

**Invocação:**
```bash
/devflow adr:evolve 001
/devflow adr:evolve 001-tdd-python
/devflow adr:evolve 001-tdd-python-v1.0.0
```

**Workflow:** PREVC SMALL dedicado.

**Recusa imediata se:** arquivo não existe; status `Substituido`/`Descontinuado`; há ADR `Proposto` não aprovada na linhagem.

**P phase:** entrevista de classificação:
- (patch) typo/clarificação — sem mudar comportamento
- (minor) adicionar guardrail/enforcement
- (major) decisão mudou → cria ADR nova com `supersedes`
- (refine) ADR-filha → cria ADR nova com `refines`, antiga inalterada

**E phase — comportamento por tipo:**

| Tipo | Filesystem | Frontmatter | Status |
|---|---|---|---|
| patch | `git mv` rename para `vX.Y.(Z+1)` | bump version patch | preserva `Aprovado` |
| minor | `git mv` rename para `vX.(Y+1).0` | bump version minor | volta para `Proposto` |
| major | cria novo `vX+1.0.0` + edita antigo | nova: `version: vX+1.0.0`, `supersedes: [<antigo>]`; antigo: `status: Substituido` | nova `Proposto`; antiga `Substituido` |
| refine | cria nova ADR (próximo número) | `refines: [<pai>]`, `version: 1.0.0` | nova `Proposto`; pai inalterada |

**V phase:** Step 2.5 estendido. Check 12 valida grafo (supersedes/refines apontam para arquivos existentes; sem loops; sem auto-referência).

## 6. Contratos

### 6.1 Schema do README index (14 colunas)

```markdown
| # | Título | Versão | Categoria | Stack | Escopo | Status | Kind | Contrato | Refines | Supersedes | Criada | Guardrails | Arquivo |
```

**Origem dos campos:** todos do frontmatter v2.1.0, exceto `Guardrails` (contagem da seção) e `Arquivo` (filename).

**Ordenação:** `# ASC, version DESC` — linhagens agrupadas, versão mais nova primeiro.

**Geração:** sempre via `scripts/adr-update-index.mjs`, idempotente. Header inclui aviso "índice gerado, não editar à mão".

**Compatibilidade com `adr-filter`:** parser do filter usa nome de coluna (não índice posicional) → adicionar colunas é não-breaking.

### 6.2 Lib `adr-audit.mjs` — interface

```bash
node scripts/adr-audit.mjs <file> [--format=json|pretty] [--enforce-gate]
```

**Output JSON:**
```json
{
  "file": "...",
  "summary": { "pass": 8, "fix_auto": 3, "fix_interview": 1 },
  "checks": [
    { "id": 1, "name": "Frontmatter estrutural", "status": "PASS|FIX-AUTO|FIX-INTERVIEW", "diagnosis": "..." },
    ...
  ],
  "gate_passed": true|false
}
```

**Exit codes:**
- 0 — todos PASS ou apenas FIX-AUTO (sem `--enforce-gate`) ou todos auto-resolvidos (`--enforce-gate` aplicou correções)
- 1 — FIX-INTERVIEW presente
- 2 — erro de parsing/IO

### 6.3 Check 12 — Consistência de grafo

Novo check da lib. Sempre `FIX-INTERVIEW` quando incoerente (nunca auto-corrige grafo).

| Condição | Classificação |
|---|---|
| `supersedes: [X]` → `X.md` existe E tem `status: Substituido` ou `Descontinuado` | PASS |
| `refines: [X]` → `X.md` existe E tem `status: Aprovado` | PASS |
| Auto-referência (A supersedes A) | FIX-INTERVIEW |
| Loop (A↔B) | FIX-INTERVIEW |
| Aponta para arquivo inexistente | FIX-INTERVIEW |
| `supersedes` aponta para ADR `Proposto` (não aprovada ainda) | FIX-INTERVIEW |

### 6.4 Step 5.6 — ADR opportunity check (`prevc-planning`)

Posição no fluxo: entre Step 5 (Present design) e Step 6 (Write design doc).

**Heurística 4-sinais (todos devem bater):**

| Sinal | Detector |
|---|---|
| Escolha entre alternativas | "escolhemos", "optamos", "em vez de", "versus" + ≥2 opções |
| Afeta stack/arquitetura | Menciona framework, biblioteca, padrão, protocolo, ferramenta |
| Implica guardrails | Contém regras "sempre/nunca" ou cria restrições recorrentes |
| Não-trivial | Task não é bugfix/rename/typo |

**Resposta do usuário:** (a) rodar `adr:new --mode=prefilled` com pré-preenchimento; (b) seguir sem ADR; (c) skip permanente neste workflow.

### 6.5 Step 2.5 — ADR Compliance Check (`prevc-validation`)

Já formalizado em §4.3. Matriz por status:

| Status antes (main) | Ação |
|---|---|
| novo arquivo | `adr-audit.mjs --enforce-gate` — bloqueia se FIX-INTERVIEW |
| `Proposto` | `adr-audit.mjs --enforce-gate` |
| `Aprovado` editada | check version bump → depois audit |
| `Aprovado → Substituido` (caso major evolve) | validar via `adr-graph.mjs` que há ADR nova com `supersedes: [<antigo>]` |
| `Substituido`/`Descontinuado` | skip |

### 6.6 Adaptação `adr-filter`

**Step 1 (parser):** aceitar 14 colunas; mapear por nome.

**Step 4 (filtros):**
- 4c (status): `Aprovado` passa, `Proposto` passa com tag `[proposto]`, `Substituido`/`Descontinuado` rejeita.
- 4d (kind): `firm` sem tag, `gated` com tag `[gated]`, `reversible` com tag `[experimental]`.

**Step 6 (output):**
```
### tdd-python [firm] (stack: python)
SEMPRE escrever o teste antes da implementação...
```

## 7. Migração das ADRs existentes

### 7.1 Transformações

**`001-tdd-python.md` → `001-tdd-python-v1.0.0.md`:**
- `git mv` rename
- Adicionar frontmatter: `version: 1.0.0`, `supersedes: []`, `refines: []`, `protocol_contract: null`, `decision_kind: firm`
- Status preserva `Aprovado` (migração é de forma)
- Remover seção `## Relacionamentos` inteira
- Migrar "Docs externos: https://docs.pytest.org/" para `## Evidências / Anexos` como `**Fontes oficiais:** [pytest docs](https://docs.pytest.org/)`
- Remover linha "ADRs relacionadas: 002-code-review" (relacionamento informal sem mapping em v2.1.0)

**`002-code-review.md` → `002-code-review-v1.0.0.md`:**
- Mesma transformação. Linha "ADRs relacionadas: 001-tdd-python" deletada.

### 7.2 TDD da migração

| # | Ação |
|---|---|
| 1 | Escrever `tests/validation/test-adr-migration.mjs` com asserts: filenames novos existem, antigos não; frontmatters com 5 campos novos; sem `## Relacionamentos`; pytest URL em Evidências |
| 2 | RED |
| 3 | Aplicar via `scripts/adr-migrate-v1-to-v2.mjs` (one-shot) |
| 4 | GREEN |
| 5 | Regenerar README via `adr-update-index.mjs` |
| 6 | `adr-audit.mjs` em ambas → 12/12 PASS |
| 7 | Commit: `refactor(adrs): migrate 001, 002 to v2.1.0 format` |

### 7.3 Pós-migração

- `scripts/adr-migrate-v1-to-v2.mjs` pode ser deletado (artefato one-shot) ou mantido como utility para casos futuros.
- `.context/templates/adrs/TEMPLATE-ADR.md` (v1) é removido — template canônico passa a viver no bundle.
- `.context/plans/adr-system.md` recebe `superseded_by: adr-system-v2` no frontmatter.

## 8. Estratégia de testes reais

### 8.1 Suites

| Suite | Arquivo | Custo | Execução |
|---|---|---|---|
| A — adr-audit lib | `tests/validation/test-adr-audit.mjs` | <2s | todo commit |
| B — adr-update-index lib | `tests/validation/test-adr-index.mjs` | <1s | todo commit |
| C — adr-graph lib | `tests/validation/test-adr-graph.mjs` | <500ms | todo commit |
| D — builder integration (subagent E2E) | `tests/validation/test-adr-builder-integration.mjs` | ~60-90s, ~1-2k tokens | trigger seletivo (PRs que tocam skill ou lib) |

### 8.2 Fixtures (em `tests/validation/fixtures/adr/`)

- `valid-01-zod-validation.md` — completa, qualidade-testes (12/12 PASS)
- `valid-02-rfc7807-errors.md` — protocol-contracts, exercita Check 11 (catálogo de padrões)
- `valid-03-feature-flags.md` — `decision_kind: reversible`
- `valid-04-post-evolve-patch.md` — pós-patch (version 1.0.1, file -v1.0.1)
- `invalid-01-vague-guardrail.md` — viola Check 5
- `invalid-02-missing-alternatives.md` — viola Check 4
- `invalid-03-medium-source.md` — viola Check 8
- `invalid-04-broken-supersedes.md` — viola Check 12 (supersedes para arquivo inexistente)
- `invalid-05-cycle.md` — viola Check 12 (loop)

Cada fixture tem header `# EXPECTED:` com classificação por check para asserts da Suite A.

### 8.3 Coverage exigido

- `adr-audit.mjs` — 100% dos 12 checks com PASS + FIX-AUTO + FIX-INTERVIEW (quando aplicável)
- `adr-update-index.mjs` — 100% das 14 colunas materializadas
- `adr-graph.mjs` — 100% dos 6 casos de grafo
- skill `devflow:adr-builder` — 1 caminho feliz E2E (CREATE prefilled) na Suite D

## 9. Rollout em 5 fases

| Fase | Escopo | Agents | DoD | % do plan |
|---|---|---|---|---|
| 1 | Lib + fixtures + ports do bundle (sem SKILL.md) | backend-specialist, test-writer, documentation-writer | Suites A+B+C 100% verdes | ~40% |
| 2 | SKILL.md + dispatcher + adr-evolve.mjs | documentation-writer, architect-specialist, backend-specialist | `/devflow adr:new` cria ADR válida; `/devflow adr:audit` retorna relatório | ~25% |
| 3 | Migração 001/002 (one-shot) | refactoring-specialist, test-writer | Ambas em v1.0.0 com frontmatter v2.1.0; 12/12 PASS | ~10% |
| 4 | Integração ativa (Step 5.6, Step 2.5, adr-filter) | architect-specialist, documentation-writer, code-reviewer | Workflow sintético com decisão arquitetural → Step 5.6 oferece ADR → V phase audita | ~15% |
| 5 | Suite D (E2E) + supersede do plan antigo + docs + version bump | test-writer, documentation-writer, code-reviewer | Suite D verde; PR pronto | ~10% |

**Paralelismo:** Fase 3 e Fase 4 podem rodar em paralelo após Fase 2.

## 10. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Suite D consome muito token | Média | Médio | Trigger seletivo (só PRs que tocam skill/lib); throttling |
| FIX-AUTO da migração corrompe ADRs aprovadas | Baixa | Alto | TDD da migração (Suite específica); aplicação one-shot revertível via git |
| Schema 14-colunas quebra adr-filter atual | Baixa | Médio | Parser usa nome de coluna; teste de regressão na Fase 4 |
| Step 5.6 vira fadiga (oferece ADR demais) | Média | Baixo | Heurística 4-sinais é restritiva; opt-out persistente por workflow |
| Lib Node introduz dep nova no DevFlow | Baixa | Baixo | DevFlow já tem `scripts/*.sh` e CI é bash-based; .mjs roda em Node 20+ que já é dep |
| Hard Rule #4 (template imutável) entra em conflito com customização de projeto | Média | Médio | Template fica no bundle; projetos customizam `patterns-catalog.md` e `context.yaml` (substituíveis) |

## 11. Plans futuros (fora de escopo)

| ID | Descrição | Trigger para fazer |
|---|---|---|
| B1 | `/devflow adr:bundle --create|--apply` (export/import cross-repo) | Demanda real de compartilhar ADRs entre repos |
| B2 | `/devflow adr:audit-all` (reauditoria em massa) | Upgrade de template v2.1.0 → v3.0.0; pre-import |
| B3 | `/devflow adr:deprecate <file>` (Descontinuado standalone) | Volume suficiente de ADRs obsoletas-não-substituídas |
| B4 | ADR como first-class do PRD (gera ADR de arquitetura na Fase 0) | Após ≥3 projetos usarem fluxo PRD + ADR juntos |
| B5 | Pre-commit hook opcional rodando `adr-audit.mjs` | Demanda de feedback antes do gate V |
| B6 | MemPalace para ADRs (`/devflow-recall` semântico) | MemPalace estável; ≥10 ADRs ativas |

## 12. Resumo executivo

| Dimensão | Valor |
|---|---|
| Plan name | `adr-system-v2` |
| Scale | MEDIUM |
| Autonomy | supervised |
| Mode DevFlow | Full |
| Fases | 5 |
| Componentes novos | 5 |
| Skills modificados | 3 |
| Suites de teste | 4 (A, B, C determinísticas; D triggered) |
| Fixtures | 9 |
| ADRs migradas | 2 (001, 002) |
| Plans futuros registrados | 6 (B1-B6) |
| Risco principal mitigado | Custo da Suite D |

---

## Aprovação

Spec aprovado em entrevista de brainstorming (24/04/2026). Próximo passo: `superpowers:writing-plans` para gerar o plano de implementação bite-sized.
