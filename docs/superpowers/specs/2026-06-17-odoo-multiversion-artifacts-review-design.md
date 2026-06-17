# Design — Revisão e otimização dos artefatos Odoo para multi-versão (12–18)

> **DevFlow workflow:** odoo-multiversion-artifacts | **Scale:** LARGE | **Phase:** P→R
> **Data:** 2026-06-17 | **Idioma:** pt-BR

## Objetivo

Revisar (code review) e reestruturar os artefatos Odoo do plugin DevFlow — agente `odoo-specialist`, skills `odoo-development` e `frontend-specialist-odoo`, standards `std-odoo-*`, stacks e profile — para que sirvam **qualquer projeto Odoo nas versões 12, 13, 14, 15, 16, 17 e 18**, separando conhecimento de framework (reutilizável) de conhecimento da empresa (NXZ).

Deliverable desta fase de Planning: **este spec + o plano de implementação**. A revisão/reescrita em si roda na fase de Execução, orientada a teste (TDD).

## Contexto e diagnóstico

Os artefatos são distribuídos pelo plugin (`agents/`, `skills/`, `assets/standards/profiles/odoo/`, `profiles/odoo.yaml`, `assets/stacks/`) e propagados para os projetos via `/devflow init` / sync. Hoje existem cópias deployadas em `~/Documentos/code/testes/nxz-odoo-migration/.context/` (o agente está atrasado vs. o plugin; as skills estão idênticas). `~/Documentos/code/nexuz/nxz_erp/` **não** tem nenhum artefato Odoo deployado.

Defeitos identificados na leitura dos artefatos:

1. **Cobertura de versão incompleta/assimétrica.**
   - `odoo-development`: cobre 14→15 (sec 4) e 15→16→17→18 (sec 5). **Odoo 12 e 13 ausentes.** POS é só Odoo 15.
   - `frontend-specialist-odoo`: declara-se **"Odoo 18+ only"** ("Do NOT use for…"); só cobre migração 15→18.
   - O agente afirma ser "version-agnostic (14,15,16,17,18+)" — contradito pelas skills ancoradas em 15/18 e sem citar 12/13.
2. **Defeito estrutural:** numeração de seções quebrada em `odoo-development` (header "5" duplicado; subsecs 6.x sob header 7; 7.x sob header 8; etc.).
3. **Estado de projeto acoplado a artefato reutilizável:** a skill de frontend embute "migration COMPLETE (Phase 3)" e contagem de módulos migrados; o agente embute paths absolutos, nomes de DB, portas e service-name Docker.
4. **Contaminação NXZ transversal** (menções a `nxz`): `odoo-development/SKILL.md` (65), `frontend-specialist-odoo` SKILL+refs (12+10+13), agente (10), e **4 standards** (`std-odoo-oca-separation` — a descrição diz "vs NXZ" —, `std-odoo-fiscal-br-integrity`, `std-odoo-version-api-hygiene`, `std-odoo-qweb-pdf-safety`).
5. **Grounding estático:** tabelas de breaking-change vêm da memória; não há ponteiros para a doc versionada (docs-mcp-server `search_docs`/`find_version`) nem para fonte OCA, contrariando `std-grounding`.
6. **Localização BR fundida com NXZ:** conhecimento l10n_br/NFC-e/SEFAZ (reutilizável em qualquer loja Odoo BR) está misturado com o que é estritamente NXZ.

### Infraestrutura existente (a aproveitar)

- `profiles/odoo.yaml` — detecção data-driven (`__manifest__.py`/`__openerp__.py` ou deps em pyproject/requirements) → agentes + skills + **17 standards** + **wishlist de stacks** (`odoo-12`, `odoo-17`, `odoo-18` — faltam 13/14/15/16) + dispatch keywords.
- `assets/standards/profiles/odoo/` — 17 `std-odoo-*.md` + linters `machine/*.js`, em tiers (Tier 3 já rotulado "domínio NXZ").
- `scripts/lib/detect-framework.mjs` — `detectFrameworks()` retorna **todos** os profiles que casam (`profiles.filter`) + agregador → **composição de profiles já é suportada**.

## Decisões (fechadas com o usuário)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Casa canônica dos artefatos | **Plugin DevFlow** (fonte-de-verdade; propaga via init/sync) |
| D2 | Estrutura genérico vs específico | **3 camadas:** L1 framework genérico + L2 localização BR + L3 overlay NXZ |
| D3 | Profundidade 12/13 | **Paridade total 12–18** |
| D4 | Grounding | **Híbrido:** tabelas curadas + ponteiros docs-mcp/OCA |
| D5 | Abrangência do overlay | **Cross-surface completo** (skill + extração de env do agente + standards NXZ gated) |
| D6 | Gating do overlay NXZ | **Novo `profiles/nxz.yaml`** compondo sobre o profile odoo |
| D7 | Execução da revisão | **TDD com suíte de lint** (RED→reescrita→GREEN), reviewers code-reviewer + acurácia via docs-mcp |

## Arquitetura-alvo

```
PLUGIN DevFlow
├── profiles/
│   ├── odoo.yaml          (L1+L2) detecta Odoo → core + BR + stds genéricos + stacks 12–18
│   └── nxz.yaml  ⟵ NOVO   (L3)   detecta author=Nexuz / nxz_* → overlay + stds-NXZ
│
├── skills/
│   ├── odoo-development/           L1 core backend, 12→18, país-agnóstico, NXZ-free
│   ├── frontend-specialist-odoo/   L1 core frontend, 12→18 (deixa de ser "18-only")
│   ├── odoo-l10n-br/      ⟵ NOVO   L2 localização BR genérica (l10n_br, NFC-e, SEFAZ, DANFE)
│   └── odoo-nxz-overlay/  ⟵ NOVO   L3 NXZ (grafo deps, bridge naming, hierarquia POS, sub-agentes)
│
├── agents/odoo-specialist.md       env hardcoded → migrado p/ contexto de projeto (.context/)
│
├── assets/standards/profiles/
│   ├── odoo/   L1+L2 stds (limpar "vs NXZ" das descrições; BR genérico permanece)
│   └── nxz/    ⟵ NOVO  std-odoo-oca-separation + std-odoo-fiscal-br-integrity (NXZ-flavored)
│
├── assets/stacks/  manifest.yaml + backend/odoo.md (ponteiros docs-mcp 12–18)
│
└── scripts/lib/detect-framework.mjs  + regras de detecção NXZ (dirPrefixes/manifestContent)
                                       + resolução de ORIGEM de standards (ver "Composição")
```

### Camadas

- **L1 — Framework Odoo genérico.** Qualquer projeto, qualquer país. ORM, frontend (legacy widgets/Backbone 12–14, OWL1 15–16, OWL2 17, OWL3 18), POS por era, QWeb/reporting, testes, mudanças de API por versão. Zero menção a `nxz_*`, l10n_br, paths ou DB.
- **L2 — Localização brasileira (`odoo-l10n-br`).** Reutilizável em qualquer loja Odoo BR não-NXZ. l10n_br (fiscal/account/base), fluxo NFC-e/NF-e, códigos SEFAZ, gotchas fiscais, DANFE/wkhtmltopdf-fiscal. Usa nomes OCA, não `nxz_*`.
- **L3 — Overlay NXZ (`odoo-nxz-overlay`).** Só projetos NXZ. Arquitetura NXZ ERP, grafo de dependências, ordem de instalação, nomenclatura/bridge `nxz_*`, hierarquia de módulos POS NXZ, NfceProcessor/DANFE NXZ, orquestração de sub-agentes.

### Inventário de migração (de onde sai cada conteúdo)

| Conteúdo atual | Origem | Destino |
|---|---|---|
| Sec 2 (arquitetura/grafo/ordem instalação NXZ), nomenclatura bridge `nxz_*` | `odoo-development` | L3 `odoo-nxz-overlay` |
| Sec 7 fiscal BR (l10n_br, NFC-e, SEFAZ, gotchas fiscais) | `odoo-development` | L2 `odoo-l10n-br` |
| Sec 8 QWeb/wkhtmltopdf (genérico) | `odoo-development` | L1 (fica) |
| "NXZ Project Context", hierarquia POS, "migration COMPLETE Phase 3" | `frontend-specialist-odoo` | L3 (hierarquia) / remover (estado de projeto) |
| DANFE genérico (layout 57/80mm, QR base64, `class="article"`, encoding SEFAZ) | `frontend-specialist-odoo` refs | L2 `odoo-l10n-br` |
| `NfceProcessor` (classe NXZ), hierarquia de módulos NXZ, bridges fiscais NXZ | `frontend-specialist-odoo` refs | L3 `odoo-nxz-overlay` |
| Tabela de Ambientes (paths/DB/portas), Recursos do Projeto | agente | `.context/` do projeto (não vai p/ plugin) |
| `std-odoo-oca-separation`, `std-odoo-fiscal-br-integrity` (NXZ-flavored) | profile odoo | `assets/standards/profiles/nxz/` |
| Demais 15 standards (limpar "vs NXZ") | profile odoo | permanecem (L1/L2) |

### Detecção NXZ (`profiles/nxz.yaml`)

`detect.files`/`detect.manifestDeps` atuais não cobrem `author='Nexuz'` nem diretórios `nxz_*`. Serão adicionadas duas regras de detecção ao `detect-framework.mjs`, com teste dedicado:
- `detect.dirPrefixes: ["nxz_"]` — diretório cujo nome começa com o prefixo (bounded por `MAX_DEPTH`, ignorando `SKIP_DIRS`).
- `detect.manifestContent: [{file, keys, anyOf}]` — substring em **chaves específicas** do manifest (`author`/`maintainer`/`website`), **não** substring livre no arquivo (evita falso-positivo de "Nexuz" em comentário/changelog de addon OCA).

**Restrições de segurança (encodadas como asserts no teste):** os novos walkers recursam apenas em `e.isDirectory()` (não seguem symlink, igual ao `treeHasFile` atual); leitura de manifest com cap de tamanho (`statSync.size` < 512KB) anti-DoS; profundidade limitada a `MAX_DEPTH`.

### Composição de profiles (correção de design — origem de standards)

O `detect-framework.mjs` **já** retorna todos os profiles que casam (`profiles.filter`) e o agregador `frameworkContributions` **já une `agents`, `skills`, `standards` e `stacks`** (dedup de standards por id, de stacks por `lib`). Portanto **não** é preciso "estender" o agregador para standards/stacks — apenas confirmar com teste.

**Defeito a corrigir (C1):** o `project-init` copia cada standard de `assets/standards/profiles/<framework>/<id>.md`, resolvendo `<framework>` **por profile, não por std**. Com a composição, o agregador devolve a *união* de ids sem dizer de qual profile cada id veio — então a cópia não sabe que `std-odoo-oca-separation` agora vive em `profiles/nxz/` e os demais em `profiles/odoo/`. **Resolução adotada:** o agregador passa a devolver `standards` como objetos `{id, framework}` (origem preservada), e o `project-init`/`context-sync` copiam usando essa origem. Coberto por um teste de dry-run que assere a resolução de path **por id** (não só "recebe L1+L2+L3").

## Critérios de qualidade (= o que a suíte de lint testa, RED→GREEN)

1. **Cobertura de versão:** L1 cita explicitamente 12,13,14,15,16,17,18; frontend deixa de ser "18-only".
2. **Sem acoplamento de ambiente no core:** zero paths absolutos / nomes de DB / portas / service-name em L1 e L2.
3. **Separação de camadas:** o scan cobre os 2 SKILL.md de L1 **e** os `.md` de `assets/standards/profiles/odoo/`. Token-scan: `/\bnxz\b/i` (não só `nxz_*`) + lista de nomes de classe/domínio NXZ (`NfceProcessor`, etc.) + `l10n_br` em L1. L1 não menciona nenhum; L2 não menciona `nxz`/nomes NXZ; conteúdo NXZ só em L3.
4. **Integridade estrutural:** numeração monotônica e sem duplicatas em H2 (`## N.`) **e** coerência de subseção (`### N.M` herda o N do `## N.` pai — pega o defeito real `### 5.x` sob `## 6.`).
5. **Grounding híbrido:** cada tabela de breaking-change tem ponteiro para `search_docs`/`find_version` ou fonte OCA.
6. **Cross-refs resolvem:** todo `references/x.md` citado existe.
7. **Front-matter válido** em skills/agente/standards.
8. **Integridade de profile:** `profiles/nxz.yaml` casa só em projetos NXZ; `odoo.yaml` segue casando em qualquer Odoo; standards/stacks listados existem no disco (espelha `test-profile-standards-integrity.mjs`).

## Estratégia de testes (TDD real, não content-check)

- Suíte Node `.mjs` espelhando `tests/.../.context/standards/machine/std-*.test.mjs` e `tests/integration/test-profile-standards-integrity.mjs`, **1 assert por critério acima**, rodando contra os arquivos **do plugin**.
- Ordem por grupo de tarefa: escrever teste falhando (RED) → reescrever artefato → verde (GREEN).
- Qualquer E2E que simule sync roda **em tmpdir**, nunca in-place (incidente prévio: wipe destrutivo apagou WIP).
- Teste de detecção NXZ: fixtures de projeto com/sem `author='Nexuz'` e com/sem `nxz_*` dir.

## Propagação e confirmação (fase C)

1. Plugin corrigido → bump de versão (pipeline de autoFinish: README → bump → commit → push → merge → cleanup).
2. Sync para `nxz-odoo-migration` (recebe L1+L2+L3, é NXZ) e `nxz_erp` (recebe L1+L2+L3, é ERP NXZ) — antes, reconciliar o agente atrasado no projeto. **Salvaguarda:** o sync nunca sobrescreve `.context/` com edição local não-commitada; fazer `diff` antes e abortar se houver WIP (alinha com o incidente prévio de sync destrutivo). Qualquer simulação roda em `mkdtempSync` com assert de que o destino começa por `os.tmpdir()` antes de `rsync --delete`.
3. Standards standalone: se `std-odoo-*` default mudar, push para `NEXUZ-SYS/devflow-standards` (só `.md`) antes do Step 4d do `/devflow update`, senão o fetch reverte. (Validar se os standards de profile entram nesse fluxo.)

## Riscos

- **Paridade 12/13 frontend (sem OWL):** stack legada (Backbone/`web.widget`); doc-mcp `odoo 12.0/13.0` pode não estar indexada → indexar via `scrape-stack-batch` ou marcar `skipDocs` com narrativo curado.
- **Detector NXZ:** mudança em `detect-framework.mjs` é caminho crítico (afeta todo init/sync) → cobertura de teste obrigatória + rodar a suíte de profiles existente.
- **Divergência do agente:** cópia em `nxz-odoo-migration` está atrasada; reconciliar antes do sync para não perder ajustes locais.
- **Migração de standards Tier-3:** mover `std-odoo-oca-separation`/`fiscal-br-integrity` para `profiles/nxz/` pode quebrar `test-profile-standards-integrity.mjs` → atualizar manifests e testes juntos.

## Fora de escopo

- Migrar/alterar código real de módulos Odoo nos projetos.
- Alterar módulos OCA ou os servidores MCP Odoo.
- Indexar de fato as docs 12–18 no docs-mcp (é follow-up via `/devflow:scrape-stack-batch`; o plugin entrega só a wishlist).
- Deploy/operação dos ambientes Odoo.
