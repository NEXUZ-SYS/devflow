# Desframeworkizar o namespace global do plugin — design

> **Workflow PREVC:** `deframework-plugin-namespace` · **Escala:** LARGE · **Fase:** P
> **Data:** 2026-08-04 · **Impacto:** BREAKING (major)

## Problema

O DevFlow é um *bridge* genérico entre superpowers e dotcontext, distribuído sob MIT e
executado em projetos-cliente de stacks arbitrárias. O próprio manifest de stacks do
repo declara essa identidade:

> "DevFlow é um BRIDGE plugin: roda em projetos de usuários, não tem frameworks de
> aplicação próprios."

Apesar disso, o plugin publica no namespace global `devflow:*` — em **todo** projeto —
skills de um framework específico (Odoo) e de um produto proprietário (NXZ/Moober), além
de um agente de projeto (`Odoo Specialist`) que compete com a responsabilidade do
dotcontext.

### Evidência observada

Este repositório é o próprio DevFlow: Node + bash, zero Odoo. Ainda assim o harness
expõe nele `devflow:odoo-development`, `devflow:frontend-specialist-odoo`,
`devflow:odoo-l10n-br`, `devflow:odoo-nxz-overlay`, `devflow:nxz-go-test` e o agent type
`devflow:Odoo Specialist`.

### Causa raiz

O Claude Code registra **todo** `skills/<nome>/SKILL.md` de um plugin como skill
invocável por barra (`/devflow:<nome>`), e todo `agents/<nome>.md` como agent type. Não
existe flag de frontmatter para opt-out: **estar em `skills/` é ser um comando global**.

O gating por perfil de framework (`profiles/<fw>.yaml` + `detect-framework.mjs`,
ADR-008) governa apenas a **cópia** de artefatos para o `.context/` do projeto. Ele
nunca teve efeito sobre o registro no namespace.

Prova por contraste dentro do próprio repo: os 15 Standards de Odoo moram em
`assets/standards/profiles/odoo/` e **nunca** aparecem no namespace. O padrão correto já
existia; skills e agents é que ficaram do lado errado da linha.

### Dois diagnósticos sob o mesmo sintoma

| Artefato | Contribuído por profile? | Diagnóstico |
|---|---|---|
| `odoo-development`, `frontend-specialist-odoo`, `odoo-l10n-br` | sim (`profiles/odoo.yaml`) | função legítima, **localização errada** |
| `odoo-nxz-overlay` | sim (`profiles/nxz.yaml`) | função legítima, **localização errada** |
| `nxz-go-test` | **não — por nenhum** | **sem função no bridge**: runbook de QA de um app específico |

`nxz-go-test` merece registro à parte. Uma busca no plugin inteiro retorna um único
arquivo: ele mesmo. Nenhum profile o lista, nenhuma fase do PREVC o usa, nenhum comando
o roteia. Ele documenta o package `com.moober_self_checkout`, deep links
`nxz://` / `nxz.nexuz.app`, 148+ `testID` de telas de um app React Native — e carrega um
**caminho absoluto da máquina do autor** (`/home/walterfrey/Documentos/code/nexuz/nxz_go_play_store/`)
publicado num plugin MIT. Depende do Appium MCP, que o DevFlow não instala nem
configura. Já existe duplicado em `~/.claude/skills/nxz-go-test`.

## Decisão

**Localização passa a ser o contrato de registro.** Três classes, separadas por onde o
arquivo mora:

```
skills/                              → registrado global (capacidade do bridge)
  prevc-*, adr-builder, config, ...     44 skills genéricas, inalteradas
                                        (49 hoje − 4 relocadas − 1 retirada)

assets/skills/profiles/odoo/         → NÃO registrado; copiado sob detecção de profile
  odoo-development/  frontend-specialist-odoo/  odoo-l10n-br/
assets/skills/profiles/nxz/
  odoo-nxz-overlay/

assets/standards/profiles/{odoo,nxz}/   → já correto, intocado
profiles/{odoo,nxz}.yaml                → gating; perde a chave agents:
```

Conhecimento de framework **não é deletado** — apenas deixa de ser comando global e
passa a se materializar somente onde o profile casa. `nxz-go-test` sai do bundle: não
pode ser gated por profile nenhum e seu lugar é o `.context/skills/` do projeto que o
consome, criado pelo dotcontext.

`agents/odoo-specialist.md` é deletado e a chave `agents:` sai dos profiles. **Criar
agente de projeto é responsabilidade exclusiva do dotcontext** — princípio que o
guardrail do ADR-006 enuncia por inteiro assim:

> NUNCA mover ou criar arquivos em `docs/`, `agents/`, `skills/`, `plans/` via
> mecanismos devflow — esses dirs são gerenciados pelo dotcontext

**Tensão a resolver na fase R.** Lido ao pé da letra, esse guardrail também proibiria a
cópia de skills e Standards de perfil para `.context/` — que é justamente o mecanismo
que o ADR-008 sanciona e que já está em produção. A leitura coerente entre os dois é:
devflow **materializa contribuições de perfil** (cópia verbatim, rastreada por
proveniência), mas **não autora** conteúdo naqueles diretórios. `odoo-specialist.md`
violava a segunda metade — era conteúdo autorado pelo plugin ocupando o lugar de um
agente que o dotcontext deveria gerar. A ADR nova deve tornar essa distinção explícita
em vez de deixá-la implícita.

### Alternativas consideradas

- **Manter em `skills/` e filtrar no registro** — impossível: não há mecanismo de
  opt-out; a localização é a única alavanca. Descartada por evidência, não por gosto.
- **Diretório raso `assets/skills/<slug>/`** — perde a origem por profile e diverge do
  layout que os Standards já usam. Rejeitada por inconsistência.
- **Deletar os artefatos de framework** — perderia conhecimento validado e quebraria os
  projetos-cliente Odoo sem ganho: o problema é o registro, não a existência.
- **Externalizar Odoo em plugin separado** — corte conceitualmente limpo, mas exige
  repo, release e docs próprios. Adiado; a relocação já resolve o defeito observado.

## Arquitetura

### Mecanismo de resolução

`provenance-sync.mjs::resolveArtifacts` hoje deriva o destino do path de origem:

```js
arts.push({ src: join(pluginRoot, rel), dest: join(projectRoot, ".context", rel), … });
```

Isso só funciona porque `skills/` do plugin espelha `.context/skills/`. Com a origem em
`assets/skills/profiles/<fw>/<slug>`, o destino ingênuo viraria
`.context/assets/skills/profiles/…`. A função passa a resolver **origem por slug** —
base em `skills/<slug>`, profile em `assets/skills/profiles/<fw>/<slug>` — e a calcular
`dest = .context/skills/<slug>/…` **explicitamente**, como o ramo de Standards logo
abaixo já faz.

`gen-known-hashes.mjs::distributableFiles` ganha `assets/skills/profiles` como terceira
raiz de varredura.

`detect-framework.mjs::frameworkContributions` perde o agregador `agents` e ganha
`skillsWithOrigin`, paralelo ao `standardsWithOrigin` existente.

### Vínculo skill ↔ agente de projeto

O ponteiro `dispatchKeywords: { odoo-specialist: [...] }` fica órfão quando o agente do
plugin some. O profile passa a declarar a que **papel** cada skill se liga:

```yaml
# profiles/odoo.yaml
skills: [odoo-development, frontend-specialist-odoo, odoo-l10n-br]
skillBindings:
  backend-specialist:  [odoo-development, odoo-l10n-br]
  frontend-specialist: [frontend-specialist-odoo]
dispatchKeywords:                      # aponta para papéis reais do projeto
  backend-specialist:  ["odoo", "orm", "addon", "l10n_br"]
  frontend-specialist: ["owl", "qweb", "pos"]
```

Na cópia, `context-sync` grava `skills: [...]` no frontmatter do agente de projeto
correspondente:

```yaml
---
type: agent
name: backend-specialist
role: backend
skills: [odoo-development, odoo-l10n-br]   # ← gravado pelo sync
scaffoldVersion: "2.0.0"
---
```

`agent-dispatch` e a fase E do PREVC leem essa chave em vez de adivinhar.

Dois cuidados assumidos: o dotcontext é dono do arquivo, então a escrita é **aditiva e
idempotente** (reaplica após regeneração, nunca reescreve o corpo); e se o agente do
papel não existir, o binding é registrado como pendência e **reportado** — o sync não
cria agente.

### Órfãos e limpeza consentida

Órfão passa a ter definição mecânica: **artefato no manifesto de proveniência do projeto
que nenhum profile ativo contribui mais**. O sync classifica e reporta; nunca remove
sozinho (guardrail ADR-012). A oferta de limpeza carrega veredito de segurança:

- hash do arquivo **∈** registry → "cópia intocada do plugin, remoção segura"
- hash **∉** registry → "divergente ou artefato aposentado — revise antes de remover"

### Proveniência

`known-hashes.json` é uma lista plana de 337 hashes **de conteúdo** (`schema: 1`), sem
paths: `sha256(readFileSync(arquivo))`. Duas consequências:

1. **A relocação não altera o registry.** Conteúdo idêntico ⇒ hash idêntico. Adicionando
   a nova raiz à varredura, o conjunto permanece o mesmo. Vira asserção de teste — se
   falhar, é porque algum conteúdo mudou junto com o move, que é exatamente o que se
   quer detectar em separado.
2. **Aposentar o `nxz-go-test` remove seus hashes.** `genBackfill` deriva de
   `indexedFiles()` sobre a árvore atual, então artefato retirado perde o histórico. Não
   se constrói lista `retired/` para isso (YAGNI): a única consequência é um deploy
   antigo deixar de ser reconhecível como intocado, caso já coberto pelo ramo
   conservador da limpeza.

## Testes

TDD real, RED → GREEN. O teste central é o guard de regressão do defeito original.

| Teste | Asserção |
|---|---|
| **`test-profile-skills-not-registered`** (novo) | `skills/` e o conjunto contribuído por profiles são **disjuntos**. Fail-closed. |
| `resolveArtifacts` source-aware | profile resolve de `assets/skills/profiles/<fw>/<slug>`; base de `skills/<slug>`; `dest` sempre `.context/skills/<slug>/…` |
| Integridade do trio | todo slug em `profiles/<fw>.yaml skills:` tem diretório com `SKILL.md`; sem órfão no diretório |
| Invariante de proveniência | regenerar após o move ⇒ mesmo conjunto de hashes (menos os do `nxz-go-test`) |
| `frameworkContributions` | não retorna `agents`; retorna `skillsWithOrigin` |
| Detecção de órfão | manifesto com artefato não-contribuído ⇒ reportado, **não** removido |
| Binding no agente | `skills:` gravada preservando demais chaves; idempotente |

Atualizar: `test-profile-nxz-integrity`, `test-profile-standards-integrity`,
`test-profile-standards-wiring`, `test-detect-framework`, `test-gen-known-hashes`,
`test-provenance-sync`. **Deletar** `test-odoo-specialist-refs.mjs` junto com o agente.

```yaml
requiredSignals: [unit, integration, lint]
```

### Limitação declarada

**Nenhum teste automatizado observa o desaparecimento do namespace** — isso depende do
Claude Code reindexar o plugin. O teste de disjunção é um proxy estrutural forte; a
confirmação final é observação manual após reinício da sessão, e será tratada como tal
na fase V — *não* como sinal verde de teste.

## Escopo colateral

- `skills/adr-builder/assets/context.yaml` — neutralizar defaults proprietários
  (`NXZ ERP/Go/KDS/Delivery`; verticais `food service/restaurantes/varejo/franqueados`)
  para placeholders genéricos. O arquivo já se documenta como substituível; só os
  defaults é que vazam.
- `templates/agents/odoo-project-context.example.md` — remover referências a
  `odoo-specialist`; apontar para o agente de projeto e o frontmatter `skills:`.
- Exemplos hardcoded em `skills/project-init/SKILL.md` (~425-427, ~517-518, ~570,
  ~604-605), `skills/agent-dispatch/SKILL.md` (~37, ~45, ~75) e
  `skills/context-sync/SKILL.md` (~141).
- `assets/stacks/backend/odoo.md` — **fica**: já gated por detecção de deps no
  `stack-filter`.
- A worktree `.claude/worktrees/feature+prevc-active-feature-guard` **não é tocada**
  (WIP de outra feature).

## ADR e versionamento

**ADR nova, `refines: [008]`.** A decisão do ADR-008 (Standards de perfil copiados)
continua válida; esta acrescenta que *localização = contrato de registro*, estende a
regra a skills e **revoga** a contribuição de agents por profile — que nunca teve ADR,
veio do mecanismo da v1.13.0. A relação será confirmada mecanicamente por
`adr-decision.mjs` no Step 3.5 do Planning, não por prosa.

**Versionamento: major.** Somem comandos invocáveis (`devflow:odoo-*`,
`devflow:nxz-go-test`) e o agent type `devflow:Odoo Specialist`. Repo é
`git.versioning: pipeline` — o bump sai pelo release workflow, não local.
v2.0.1 → v3.0.0.

## Guardrails respeitados

- **ADR-008** — Standards de perfil permanecem em `assets/standards/profiles/<fw>/`;
  trio yaml ↔ MANIFEST ↔ arquivos mantido; cópia, nunca live-merge.
- **ADR-012** — nunca sobrescrever arquivo do usuário; órfão é preservado e reportado;
  remoção só sob confirmação.
- **ADR-006** — criação de agente de projeto volta a ser exclusividade do dotcontext.
- **ADR-007** — allowlist do sandbox `origin:"default"` e invariante `.js` bundled-only
  permanecem intocados (nenhum linter muda de lugar).
