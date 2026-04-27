---
type: spec
name: adr-system-v2-design
description: Design spec — evolução do sistema de ADR do DevFlow para o padrão v2.1.0, com nova skill devflow:adr-builder e integração ativa em prevc-planning, prevc-validation e adr-filter
status: approved
created: 2026-04-24
revised: 2026-04-24
supersedes: 2026-04-03-adr-system-design.md
scale: MEDIUM
autonomy: supervised
mode: Full
revision_notes: "Architect review aplicada — adicionadas tabela FIX-AUTO completa, decisão zero-deps cross-project, mecanismo executor do Step 5.6, ajustes em §4, §6, §7, §9, §10."
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
| P10 | Libs Node usam **zero deps externas** (stdlib-only) — DevFlow é meta-tooling cross-project (Node/Python/Go/Java); injetar deps no projeto cliente não é aceitável. Parser de YAML frontmatter é próprio mínimo (~80 linhas, em `scripts/lib/adr-frontmatter.mjs`). | Architect review — Gap 2 |
| P11 | Mecanismo do Step 5.6 (`prevc-planning`) é **instrução LLM** no SKILL.md (não regex, não lib auxiliar). LLM avalia os 4 sinais durante o brainstorming, brittleness mitigada pelo opt-out persistente `skip_adr_offer`. | Architect review — Gap 3 |
| P12 | Migração one-shot (Fase 3) **desabilita FIX-AUTO** — usa só FIX-INTERVIEW. Garante revisão humana em ADRs aprovadas, mitiga risco de corrupção. | Architect review — Gap 1 |

## 4. Arquitetura

### 4.1 Componentes

| # | Componente | Localização | Responsabilidade |
|---|---|---|---|
| 1 | Skill `adr-builder` | `skills/adr-builder/SKILL.md` + `references/` + `assets/TEMPLATE-ADR.md` | Conversacional. Modos CREATE (guiado/livre/pré-preenchido) e AUDIT-interactive. Orquestra chamadas à lib. |
| 2 | Lib `adr-audit` | `scripts/adr-audit.mjs` + `scripts/lib/adr-frontmatter.mjs` + `scripts/lib/adr-graph.mjs` | Node executável. 12 checks (11 originais + Check 12 grafo). Output JSON. |
| 3 | Lib `adr-evolve` | `scripts/adr-evolve.mjs` | Orquestra transição patch/minor/major/refine — git mv ou novo arquivo + bump frontmatter + status. |
| 4 | Lib `adr-update-index` | `scripts/adr-update-index.mjs` | Regenera `.context/docs/adrs/README.md` a partir do frontmatter de cada arquivo. |
| 5 | Comando dispatcher | `commands/devflow-adr.md` | Recebe `/devflow adr:<new\|audit\|evolve>` e dispatcha para a skill. |
| 6 | Script migração one-shot | `scripts/adr-migrate-v1-to-v2.mjs` | Migra ADRs do template v1 (DevFlow original) para v2.1.0. Artefato descartável após Fase 3. |
| 7 | Modificação `prevc-planning` | `skills/prevc-planning/SKILL.md` | Adicionar Step 5.6 — ADR opportunity check (instrução LLM com 4 sinais; opt-in). |
| 8 | Modificação `prevc-validation` | `skills/prevc-validation/SKILL.md` | Adicionar Step 2.5 — ADR Compliance Check (matriz por status). |
| 9 | Modificação `adr-filter` | `skills/adr-filter/SKILL.md` | Adaptar parser para schema 14-colunas; **filtro novo por `Kind`** (código novo, não só parsing); tags `[firm]`/`[gated]`/`[experimental]`. |

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
| `docs/adr-builder.skill` (ZIP) | upload original do usuário | Extraído na Fase 1 para portar conteúdo; **deletado após Fase 1** (não é source of truth pós-port — bundle vive em `skills/adr-builder/`) | N/A |
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

### 4.4 Cross-project compatibility (decisão arquitetural)

DevFlow é **meta-tooling cross-project** — o mesmo plugin é instalado em projetos Python, Go, Java, Node sem package.json, ou Node com toolchain pesada. Logo, as 4 libs novas têm **restrições rígidas de portabilidade**:

| Restrição | Implicação |
|---|---|
| **Zero deps externas (npm)** | Toda lib usa apenas Node 20+ stdlib. Nada de `import yaml from 'js-yaml'`. |
| **Sem package.json no DevFlow** | Plugin não introduz `package.json`; libs são `.mjs` standalone executáveis via `node scripts/X.mjs`. |
| **Sem assumir toolchain do projeto** | Não invocar `npm`, `yarn`, `pip`, `cargo`. Tudo via Node nativo + `git` CLI (universal). |
| **Cross-platform** | Path handling via `node:path`, não strings hardcoded. Linux/macOS/Windows-WSL. |
| **Output máquina-legível** | Lib emite JSON em stdout (consumível por bash, GitHub Actions, CI de qualquer stack). |

**Parser de YAML frontmatter** (`scripts/lib/adr-frontmatter.mjs`): implementação própria mínima cobrindo o subset usado pelo template ADR (chave-valor escalar, listas inline `[]`, listas de uma linha `[a, b]`, strings quoted/unquoted, null, datas YYYY-MM-DD). Estima-se ~80 linhas. Testada exaustivamente via fixtures (Suite A inclui edge cases de parsing).

**Trade-off explícito:** projetos cliente que adotam DevFlow ganham auditoria de ADR sem ter que instalar nada além do plugin DevFlow. Custo: o plugin mantém ~80 linhas de código de parsing que poderiam ser delegadas a uma lib madura. Aceitável dado o domínio limitado.

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
node scripts/adr-audit.mjs <file> [--format=json|pretty] [--enforce-gate] [--apply-fix-auto] [--no-fix-auto]
```

**Flags:**
- `--enforce-gate` — exit 1 se houver FIX-INTERVIEW não resolvido (modo CI / V phase).
- `--apply-fix-auto` — aplica as correções FIX-AUTO no arquivo (escreve em disco).
- `--no-fix-auto` — desabilita FIX-AUTO inteiro, classificação degrada para FIX-INTERVIEW (modo migração).

**Output JSON:**
```json
{
  "file": "...",
  "summary": { "pass": 8, "fix_auto": 3, "fix_interview": 1 },
  "checks": [
    { "id": 1, "name": "Frontmatter estrutural", "status": "PASS|FIX-AUTO|FIX-INTERVIEW", "diagnosis": "...", "auto_action": "..." },
    ...
  ],
  "gate_passed": true|false
}
```

**Exit codes:**
- 0 — todos PASS ou apenas FIX-AUTO (sem `--enforce-gate`) ou todos auto-resolvidos (`--enforce-gate --apply-fix-auto` aplicou correções)
- 1 — FIX-INTERVIEW presente, ou `--enforce-gate` ativo com FIX-AUTO sem `--apply-fix-auto`
- 2 — erro de parsing/IO

**Concurrent safety:** `adr-update-index.mjs` usa **advisory lock via Node `open(.lock, 'wx')`** (exclusivo no FS, não literal `flock(2)`) sobre `.context/docs/adrs/.lock`. O conteúdo do lock inclui `{pid, ts}` para liveness recovery: ao encontrar lock existente, lê conteúdo, checa `process.kill(pid, 0)` (processo ainda vivo?) ou `Date.now() - ts > 30000` (expirou?). Se stale, `unlink` e retry. Isso evita lock órfão de processo SIGKILL'd. Cross-platform (Linux/macOS/Windows-WSL) via Node stdlib only.

**Path safety:** flag `--project=<path>` é resolvida via `path.resolve()` e validada contra `process.cwd()` — paths que escapam do diretório de trabalho são rejeitados (mitigação de path traversal).

**Worktree-safe diff:** Step 2.5 sempre usa `git diff $(git merge-base HEAD main)...HEAD` (não `HEAD..main`) para corretamente lidar com worktrees, branches divergentes, e pulls intermediários.

**Shell-safe execution:** todas as chamadas a comandos externos (`git mv`, etc.) usam `execFileSync('cmd', [arg1, arg2])` com argv array, **nunca** `execSync(\`cmd ${var}\`)` com interpolação de string. Isso bypassa o shell e elimina vetor de command injection via filenames maliciosos.

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

**Mecanismo executor:** instrução em linguagem natural no `SKILL.md` de `prevc-planning`, avaliada pelo Claude durante o brainstorming (P11). Não é regex, não é lib auxiliar. O LLM já está no contexto do design proposto — classificar "isso é decisão arquitetural?" é tarefa natural sem custo extra.

**Brittleness mitigada por:**
1. **4 sinais simultâneos** — só ativa quando os 4 batem (alta especificidade, baixa fadiga).
2. **Opt-out persistente** — usuário pode dizer "não oferecer mais neste workflow" → workflow metadata recebe `skip_adr_offer: true`, Step 5.6 skipa em invocações subsequentes.
3. **Texto de oferta declarativo** — sempre cita a frase exata do spec que disparou os 4 sinais (transparência sobre por que está perguntando).

**Heurística 4-sinais (LLM avalia todos simultaneamente):**

| Sinal | Como o LLM detecta |
|---|---|
| Escolha entre alternativas | Spec contém ≥2 opções discutidas com tradeoffs ("X vs Y", "em vez de", "considerei A mas optei por B") |
| Afeta stack/arquitetura | Spec menciona framework, biblioteca, padrão, protocolo, ferramenta de infra, layer de stack |
| Implica guardrails | Decisão cria regras de uso recorrentes ("sempre usar X", "evitar Y", contratos de chamada) |
| Não-trivial | Task não é bugfix, rename, typo, ou refactor cosmético |

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
- 4d (kind): `firm` sem tag, `gated` com tag `[gated]`, `reversible` com tag `[experimental]`. **⚠ Código novo, não só parsing** — adicionar dimensão de filtro (`Kind`) à lógica do `adr-filter`, não apenas reler colunas.

**Step 6 (output):**
```
### tdd-python [firm] (stack: python)
SEMPRE escrever o teste antes da implementação...
```

### 6.7 Tabela FIX-AUTO action por check

Define exatamente o que `--apply-fix-auto` modifica em cada check. Sem isso, FIX-AUTO seria vapor e o gate da V phase incalculável.

| Check | FIX-AUTO action (concreta) | FIX-INTERVIEW (escapa para humano) |
|---|---|---|
| 1 Frontmatter | Adicionar campos faltantes com defaults: `type: adr`, `version: 0.1.0`, `supersedes: []`, `refines: []`, `protocol_contract: null`, `decision_kind: firm`, `created: <hoje>`. Reverter `status: Aprovado → Proposto` em ADR nova. Corrigir `decision_kind` inválido para `firm`. | `scope` ou `category` inválido; `category: protocol-contracts` com `protocol_contract: null` |
| 2 Título/voz | — (sempre FIX-INTERVIEW) | Título genérico/pergunta; voz passiva; múltiplas decisões no mesmo título |
| 3 Foco stack | — (sempre FIX-INTERVIEW) | Menções a produto/vertical de negócio (consulta `context.yaml`) |
| 4 Alternativas | Marcar escolhida com ✓ se inferível por keyword ("escolhida", "adotamos", última posição) | <2 alternativas; tradeoff ausente |
| 5 Guardrails | Reformatar bullets concretos para começar com `SEMPRE`/`NUNCA`/`QUANDO…ENTÃO` (parser detecta verbo imperativo + reescreve prefixo) | <2 guardrails; vagueza ("seguir boas práticas", "ter cuidado", "considerar") |
| 6 Enforcement | Reformatar checkboxes para `- [ ]` GFM | <1 mecanismo; "code review" sem critério; ferramenta sem nome |
| 7 Relacionamentos | Detectar seção `## Relacionamentos` / `## Relationships` / `## Related ADRs`. Migrar URLs (linhas com `http`) para `## Evidências / Anexos`. Migrar slugs (linhas tipo "ADR X") para `supersedes` ou `refines` **apenas se inequívoco** (palavra-chave "substitui" → supersedes; "refina"/"detalha" → refines); caso contrário descartar. Deletar a seção inteira. | — |
| 8 Evidências | — (sempre FIX-INTERVIEW) | Link para Medium, dev.to, blog, Stack Overflow, YouTube |
| 9 Densidade | grep + delete frases proibidas: "isto significa que", "em outras palavras", "ou seja,", "basicamente", "de forma mais simples". Delete linhas que definem conceitos básicos (SRP, RBAC, idempotência) — heurística: linha começa com "X é" ou "X significa". | <80 linhas; >180 linhas (ou >120 sem exceção tabular); densidade tutorial pervasiva |
| 10 Código minimal | — (sempre FIX-INTERVIEW) | Bloco >25 linhas; múltiplos blocos de código |
| 11 Padrões catalogados | — (sempre FIX-INTERVIEW, conservador por design) | Padrão paráfrase sem nomear (consulta `patterns-catalog.md`) |
| 12 Grafo | — (nunca auto-corrige grafo) | `supersedes`/`refines` apontando para arquivo inexistente; auto-referência; loop; `supersedes` para ADR `Proposto` |

**Comportamento global:**
- `--apply-fix-auto` aplica todas as ações da coluna 2 sequencialmente, depois re-roda os 12 checks. Se ainda houver FIX-AUTO (caso raro de regra que cria nova violação), repete até convergir ou max 3 iterações.
- `--no-fix-auto` (modo migração) força todos os FIX-AUTO acima a virarem FIX-INTERVIEW, exigindo confirmação humana.
- **Gate de status `Aprovado`:** se a ADR sob auditoria tem `status: Aprovado`, FIX-AUTO é **automaticamente desabilitado** (mesmo sem flag `--no-fix-auto`). Modificação silenciosa de ADR aprovada altera histórico do time — sempre exige confirmação humana via fluxo EVOLVE. Esta proteção complementa P12 (que protege a migração one-shot) cobrindo o uso normal de `/devflow adr:audit --apply-fix-auto`.
- Aplicação de FIX-AUTO sempre gera diff visível ao usuário antes de commitar (no contexto da V phase, vai num commit separado: `fix(adr): auto-corrections from audit`).

### 6.8 Parser de frontmatter — `scripts/lib/adr-frontmatter.mjs`

Parser próprio mínimo, zero deps externas (P10).

**Subset de YAML suportado:**
- Chave-valor escalar: `key: value`
- Strings quoted: `key: "value with spaces"`, `key: 'value'`
- Strings não-quoted: `key: value`
- Listas inline vazias: `key: []`
- Listas inline single-line: `key: [a, b, c]`
- Null: `key: null` ou `key: ~`
- Boolean: `key: true` / `key: false`
- Datas ISO: `key: 2026-04-24`
- Comentários: `# comentário` (ignorados)
- Frontmatter delimitado por `---` no topo do arquivo

**Não suportado (intencionalmente):**
- Listas multi-linha indentadas (não aparecem no template ADR)
- Maps aninhados (não aparecem no template)
- Anchors (`&`, `*`)
- Multi-line strings (`|`, `>`)

**Interface:**
```js
import { parse, stringify } from './adr-frontmatter.mjs';

const { frontmatter, body } = parse(fileContent);
// frontmatter: { type: 'adr', version: '1.0.0', supersedes: [], ... }
// body: '# ADR — TDD para Python\n\n...'

const newContent = stringify(updatedFrontmatter, body);
// Preserva ordem dos campos quando possível, formata listas inline.
```

**Cobertura de teste:** Suite A inclui ≥10 fixtures de parsing edge cases — frontmatter sem `---` final, valores vazios, escapes em strings, datas inválidas, etc.

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
| 0 | **Grep blast radius** — `rg -l "001-tdd-python\|002-code-review" --type=md` para listar todos os arquivos que referenciam os filenames antigos (incluindo `MEMORY.md`, docs, outros skills). Atualizar cada referência **antes** do rename para evitar links quebrados. |
| 1 | Escrever `tests/validation/test-adr-migration.mjs` com asserts: filenames novos existem, antigos não; frontmatters com 5 campos novos; sem `## Relacionamentos`; pytest URL em Evidências; **zero referências stale via grep**. |
| 2 | RED |
| 3 | Aplicar via `scripts/adr-migrate-v1-to-v2.mjs` (one-shot). **Migração roda com `--no-fix-auto`** (P12) — todas as transformações são FIX-INTERVIEW e exigem confirmação humana antes de aplicar. Garante que ADRs aprovadas não sofrem alteração silenciosa. |
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
| 1 | Parser frontmatter + 4 libs + fixtures + extração do bundle ZIP + ports dos `references/` | backend-specialist, test-writer, documentation-writer | Suites A+B+C 100% verdes; bundle ZIP deletado | ~50% |
| 2 | SKILL.md + dispatcher + `adr-evolve.mjs` + lock concorrente em `adr-update-index.mjs` | documentation-writer, architect-specialist, backend-specialist | `/devflow adr:new` cria ADR válida; `/devflow adr:audit` retorna relatório; locks testados | ~22% |
| 3 | Migração 001/002 (one-shot, `--no-fix-auto`, com grep step prévio) | refactoring-specialist, test-writer | Ambas em v1.0.0 com frontmatter v2.1.0; 12/12 PASS; zero referências stale | ~10% |
| 4 | Integração ativa (Step 5.6 LLM-instrução, Step 2.5 matriz, adr-filter parser+filtro Kind) | architect-specialist, documentation-writer, code-reviewer | Workflow sintético com decisão arquitetural → Step 5.6 oferece ADR → V phase audita | ~13% |
| 5 | **Harness Suite D** (subagent E2E novo) + Suite D verde + supersede do plan antigo + docs + version bump | test-writer, documentation-writer, code-reviewer | Suite D verde; harness reusable para outros skills; PR pronto | ~15% |

**Paralelismo:** Fase 3 e Fase 4 podem rodar em paralelo após Fase 2.

**Recalibração vs versão original do spec:** Fase 1 (40% → 50%) absorve parser frontmatter + extração do ZIP que não estavam dimensionadas. Fase 5 (10% → 15%) reflete que harness de subagent E2E é infra net-new no DevFlow (nenhum suite atual usa subagent). Fases 2/3/4 ajustadas proporcionalmente.

## 10. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Suite D consome muito token | Média | Médio | Trigger seletivo (só PRs que tocam skill/lib); throttling; harness reusable amortiza custo entre futuros skills E2E |
| FIX-AUTO da migração corrompe ADRs aprovadas | **Baixa (mitigada)** | Alto | Migração roda com `--no-fix-auto` (P12) — todas as transformações exigem confirmação humana. Grep blast radius pré-rename evita links quebrados. |
| Schema 14-colunas quebra adr-filter | Baixa | Médio | Parser usa nome de coluna (não índice); filtro novo por `Kind` é código adicional testado na Fase 4 |
| Step 5.6 vira fadiga (oferece ADR demais) | Média | Baixo | 4 sinais simultâneos (alta especificidade); opt-out persistente `skip_adr_offer` por workflow; LLM avalia (não regex frágil) |
| Lib Node introduz dep nova no DevFlow | Baixa | Baixo | Node 20+ já é dep; precedente: `scripts/devflow-runner.mjs`, `scripts/runner-lib.mjs`, `tests/validation/*.mjs`, `tests/runner/*.mjs` |
| Hard Rule #4 (template imutável) conflita com customização de projeto | Média | Médio | Template fica no bundle (imutável); projetos customizam `patterns-catalog.md` e `context.yaml` (substituíveis) |
| **Colisão concorrente de `--next-number`** entre workflows paralelos | Baixa | Médio | Advisory lock via `flock` em `.context/docs/adrs/.lock`; fallback file-token no Windows-WSL; teste explícito na Suite B |
| **Plugin packaging dropa `assets/` ou `references/`** ao distribuir via marketplace | Baixa | **Alto** | Auditar `plugin.json` na Fase 1: confirmar `files` array (ou ausência implicando "tudo entra") cobre `skills/adr-builder/{assets,references}/`. Smoke test em projeto fresh-installed |
| **Toolchain Node ausente em projeto cliente** (Python/Go puros) | Baixa | Médio | Node 20+ é dep declarada do plugin DevFlow; documentação aponta isso. Libs são `.mjs` standalone (P10 — zero deps externas) |
| **Parser próprio quebra em frontmatter inesperado** | Média | Baixo | Cobertura exaustiva de fixtures de parsing (Suite A — ≥10 edge cases); fail-loud com mensagem de erro específica em vez de silently truncar |

## 11. Plans futuros (fora de escopo)

| ID | Descrição | Trigger para fazer |
|---|---|---|
| B1 | `/devflow adr:bundle --create|--apply` (export/import cross-repo) | Demanda real de compartilhar ADRs entre repos |
| B2 | `/devflow adr:audit-all` (reauditoria em massa) | Upgrade de template v2.1.0 → v3.0.0; pre-import |
| B3 | `/devflow adr:deprecate <file>` (Descontinuado standalone) | Volume suficiente de ADRs obsoletas-não-substituídas |
| B4 | ADR como first-class do PRD (gera ADR de arquitetura na Fase 0) | Após ≥3 projetos usarem fluxo PRD + ADR juntos |
| B5 | Pre-commit hook opcional rodando `adr-audit.mjs` | Demanda de feedback antes do gate V |
| B6 | MemPalace para ADRs (`/devflow-recall` semântico) | MemPalace estável; ≥10 ADRs ativas |
| B7 | Suite D — subagent E2E harness para `devflow:adr-builder` | ≥3 incidents reais que harness teria pego; ou skill estável v1+ com volume de uso justificando custo de CI (~$0.10/run, ~60-90s, ~1-2k tokens) |

## 12. Resumo executivo

| Dimensão | Valor |
|---|---|
| Plan name | `adr-system-v2` |
| Scale | MEDIUM |
| Autonomy | supervised |
| Mode DevFlow | Full |
| Fases | 5 (1=50%, 2=22%, 3=10%, 4=13%, 5=15%) |
| Componentes novos | 6 (skill + 4 libs + dispatcher + script de migração one-shot) |
| Skills modificados | 3 |
| Premissas validadas | 12 (P1-P12) |
| Suites de teste | 4 (A, B, C determinísticas, ≥1s; D triggered, ~60-90s) |
| Fixtures | ≥10 (9 ADRs + edge cases de parsing) |
| ADRs migradas | 2 (001, 002) — modo `--no-fix-auto` |
| Plans futuros registrados | 6 (B1-B6) |
| Riscos catalogados | 10 |
| Cross-project compatibility | P10 (zero deps externas, Node stdlib only, Linux/macOS/Windows-WSL) |

---

## Aprovação

Spec aprovado em entrevista de brainstorming (24/04/2026). Revisão técnica do `devflow:architect` aplicada na mesma data — 3 gaps bloqueantes fechados (P10, P11, P12), 7 ajustes menores incorporados, 4 riscos novos catalogados.

Próximo passo: `superpowers:writing-plans` para gerar o plano de implementação bite-sized.
