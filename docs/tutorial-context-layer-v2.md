# Tutorial — Context Layer v2 com DevFlow

> **Branch:** `feat/context-layer-v2`
> **Fixture de referência:** `tests/2026-05-11/` (paradigma `mcpIndexed:true`)
> **Idioma:** pt-BR

Este tutorial mostra o fluxo real de uso do Context Layer v2 em um projeto, usando como caso vivo a rodada `2026-05-11` — 21 ADRs, 20 standards e 14 frameworks indexados via MCP. Tudo o que está aqui pode ser reproduzido contra a fixture.

---

## 1. O que é o Context Layer v2

O Context Layer v2 transforma decisões arquiteturais em **enforcement automático no editor**. Ele tem 5 peças que se alimentam em cadeia:

```
┌─────────────────────────────────────────────────────────────────┐
│  Decisão técnica  →  ADR  →  manifest  →  standard  →  linter   │
└─────────────────────────────────────────────────────────────────┘
                                                          ↓
                       Hooks (Camadas 1-4) + cache + MCP docs
```

| Peça                              | Diretório                              | Propósito                                                                        |
|-----------------------------------|----------------------------------------|----------------------------------------------------------------------------------|
| **ADRs**                          | `.context/adrs/`                       | Decisão técnica versionada (TEMPLATE-ADR v2.1.0)                                 |
| **Stack manifest**                | `.context/stacks/manifest.yaml`        | Catálogo de libs/versões — `mcpIndexed:true` aponta para `docs-mcp-server`       |
| **Standards (humano)**            | `.context/standards/std-*.md`          | Regras consolidadas a partir das ADRs (princípios, anti-patterns, enforcement)   |
| **Standards (máquina)**           | `.context/standards/machine/std-*.js`  | Linter executável — produz `VIOLATION:` para o hook capturar                     |
| **Cache + hooks (Camadas 1-4)**   | `.context/cache/`                      | Latência <2s no SessionStart e em todo Read/Edit/Write                           |

A jornada do desenvolvedor é uma **cadeia ordenada**: você toma uma decisão, ela vira ADR; o auditor extrai stacks; o builder consolida standards; o linter machine vira nudge automático no editor.

---

## 2. Setup inicial

### 2.1. Configurar o projeto

```bash
/devflow config       # interview interativa → .context/.devflow.yaml
/devflow init         # scaffold .context/ se ainda não existe (delega a context-sync se existir)
```

O `.context/.devflow.yaml` resultante é mínimo:

```yaml
git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  prCli: gh
  branchProtection: true
  autoFinish: true

mempalace:
  enabled: true
  budget: 1000
```

### 2.2. (Opcional) Habilitar `docs-mcp-server` (hospedado)

O paradigma novo (`mcpIndexed:true`) **dispensa store local** em troca de queries MCP contra o **docs-mcp-server hospedado**. Basta apontar o `.mcp.json` para o servidor — sem docker/npx local:

```json
{
  "mcpServers": {
    "docs-mcp-server": {
      "type": "http",
      "url": "https://docs-mcp.nexuz.app/mcp"
    }
  }
}
```

> O scrape (`mcp__docs-mcp-server__scrape_docs`) e as queries (`search_docs`/`list_libraries`) rodam contra o **mesmo store hospedado compartilhado** — o que se indexa é exatamente o que as queries leem. Reinicie o Claude Code (`exit` + relaunch) para carregar o server.
>
> Sem MCP, o Context Layer continua funcional — só o nudge deixa de sugerir `mcp__docs-mcp-server__search_docs`.

---

## 3. Camada 1 — Criando uma ADR

### 3.1. Caso real: FSD (Feature-Sliced Design)

A fixture `tests/2026-05-11/_prompts_in/019-adr-feature-sliced-design-frontend.prompt.md` é o **input bruto** que o desenvolvedor escreve. Ele contém apenas o briefing — não o ADR pronto:

```markdown
Crie uma ADR para o monorepo nxz.one seguindo o **TEMPLATE-ADR v2.1.0** ...

## Contexto da decisão
- **Stack:** Feature-Sliced Design
- **Versão fixada:** 2.x
- **Camada arquitetural alvo:** Camada 1 — Frontend
...

## Restrições absolutas (Hard Rules da skill adr-builder)
- #4 Nunca desviar do template
- #7 ADR é arquitetura técnica pura — proibido mencionar negócio
- #8 Evidências APENAS oficiais (sem Medium/dev.to/Stack Overflow)
...

## Densidade
- 80-120 linhas no total. Ideal ~100. Modo telegráfico.
```

### 3.2. Disparar a skill

```bash
/devflow adr:new --mode=prefilled
# (ou, se quiser interview guiado:)
/devflow adr:new --mode=guided
```

A skill `devflow:adr-builder`:
1. Aplica TEMPLATE-ADR v2.1.0 (frontmatter de 14 campos).
2. Roda gates determinísticos via `scripts/adr-audit.mjs`.
3. Salva em `.context/adrs/<NNN>-<slug>-v1.0.0.md` com numeração resolvida via `adr-update-index.mjs --next-number`.

### 3.3. ADR resultante (extrato real — `021-adr-feature-sliced-design-frontend-v1.0.0.md`)

```markdown
---
type: adr
name: adr-feature-sliced-design-frontend
description: Feature-Sliced Design 2.x como organização por layers no Frontend
scope: organizational
source: local
stack: Feature-Sliced Design 2.x
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

## Decisão
Adotar Feature-Sliced Design 2.x ... Layers fixos top-down:
app → pages → widgets → features → entities → shared.

## Guardrails
- SEMPRE expor slice via index.ts (Public API)
- NUNCA importar de layer superior ou de slice irmã
- NUNCA usar processes/ (deprecado em FSD 2.x)
...

## Evidências / Anexos
**Fontes oficiais:**
- [FSD — Overview](https://feature-sliced.design/docs/get-started/overview)
- [FSD — Layers Reference](https://feature-sliced.design/docs/reference/layers)
```

### 3.4. Auditoria

```bash
node scripts/adr-audit.mjs .context/adrs/021-adr-feature-sliced-design-frontend-v1.0.0.md --enforce-gate
```

Roda 12 checks determinísticos. Saída zero = ADR válida.

---

## 4. Camada 2 — Stack manifest (auto-extração + MCP)

### 4.1. Extração automática

```bash
node scripts/adr-extract-stacks.mjs --add
```

O script percorre `.context/adrs/`, casa o campo `stack:` do frontmatter contra o Tier-0 parser e adiciona ao `manifest.yaml`. Para a ADR 021 (`Feature-Sliced Design 2.x`), o nome composto **não casa** no Tier-0 — entry adicionada manualmente como `feature-sliced-design`.

### 4.2. `manifest.yaml` resultante (extrato real)

```yaml
spec: devflow-stack/v0
frameworks:
  typescript:
    version: "5.9.0"
    mcpIndexed: true
    discoveryHints:
      - "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html"
      - "https://github.com/tc39/proposals"
  next:
    version: "16.2.0"
    mcpIndexed: true
    discoveryHints:
      - "https://nextjs.org/docs/app"
  feature-sliced-design:
    version: "2.0.0"
    mcpIndexed: true
```

**Por que `mcpIndexed:true`?** O paradigma novo abandona arquivos `.md` cacheados localmente em favor de queries semânticas via `mcp__docs-mcp-server__search_docs`. Vantagens:
- 0 bytes em disco por lib — store fica no Docker.
- Versões sempre frescas via `refresh_version`.
- Busca semântica natural ("how do I use FSD entities?") em vez de leitura de docs inteiras.

### 4.3. Validação

```bash
node scripts/lib/context-index-cli.mjs --project=tests/2026-05-11 --format=text
```

Output (truncado):

```
Standards declarados (20):
  - std-feature-sliced-design — (manual — sem auto-trigger) (linter:✓)
  - std-react — **/*.tsx, **/*.jsx (linter:✓)
  - std-typescript — **/*.ts, **/*.tsx (linter:✓)
  ...

Stack refs (14/14 disponíveis):
  - typescript@5.9.0 — MCP indexed (query: mcp__docs-mcp-server__search_docs)
  - feature-sliced-design@2.0.0 — MCP indexed (query: mcp__docs-mcp-server__search_docs)
  ...
```

---

## 5. Camada 3 — Standards humanos (consolidação ADR → std)

### 5.1. Geração via skill

```
Use a skill devflow:standards-builder no modo FROM-ADR para a ADR 021.
```

A skill consolida `Decisão`, `Anti-patterns` (a partir dos `NUNCA` em Guardrails), `Enforcement` e `Evidências` em um arquivo `.md` enxuto.

### 5.2. `std-feature-sliced-design.md` resultante (real)

```markdown
---
id: std-feature-sliced-design
description: Feature-Sliced Design 2.x como organização por layers no Frontend
version: 1.0.0
applyTo: []                                 # FSD não tem glob natural — task #70
relatedAdrs: ["adr-feature-sliced-design-frontend"]
enforcement:
  linter: standards/machine/std-feature-sliced-design.js
weakStandardWarning: true
---

# Standard: feature-sliced-design

## Princípios
Adotar Feature-Sliced Design 2.x ... Layers top-down: app → pages → widgets ...

## Anti-patterns
| Errado | Certo |
|---|---|
| importar de layer superior ou de slice irmã | Aplicar a alternativa da ADR |
| usar processes/ (deprecado em FSD 2.x)      | Aplicar a alternativa da ADR |

## Linter
./machine/std-feature-sliced-design.js verifica:
1. rejeitar PR com import cross-slice ou upward
2. @feature-sliced/steiger configurado
3. vitest colocaliza spec ao lado do segment
```

### 5.3. `applyTo: []` — silenciamento controlado (task #70)

Standards de framework/SDK que não têm padrão de arquivo natural (FSD, Firestore SDK, GitHub Actions, Datadog, Zustand, Vercel AI SDK) recebem `applyTo: []` — não disparam nudge em nenhum Read/Edit/Write. Aparecem na lista declarada, mas precisam ser invocados manualmente.

```bash
# Verificação:
node scripts/lib/context-index-cli.mjs --project=tests/2026-05-11 --format=json \
  | jq '.standards[] | select(.id == "std-feature-sliced-design") | .applyTo'
# → []
```

---

## 6. Camada 4 — Standards machine (linter executável)

### 6.1. Esqueleto gerado

`std-feature-sliced-design.js` nasce como esqueleto para o autor preencher:

```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";

const filePath = process.argv[2];
if (!filePath) process.exit(0);

const content = readFileSync(filePath, "utf-8");

// TODO: implement rule check.
// Example pattern:
//   const matches = content.match(/badPattern/g);
//   if (matches) {
//     console.log(`VIOLATION: ${matches.length} of badPattern in ${filePath}.`);
//     process.exit(1);
//   }

process.exit(0);
```

### 6.2. Contrato SI-4 (Standard Interface 4)

| Campo            | Regra                                                             |
|------------------|-------------------------------------------------------------------|
| Input            | `process.argv[2]` = caminho absoluto do arquivo                   |
| Output           | `console.log("VIOLATION: <regra> (<file>:<line>) — <correção>")`  |
| Exit code        | `1` quando há violação, `0` caso contrário                        |
| Múltiplas regras | Pode emitir várias linhas `VIOLATION:` antes de sair com `1`      |

### 6.3. Implementação real (exemplo FSD)

```js
const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];

const importRegex = /^import\s+.+\s+from\s+["'](.+)["']/gm;
const matches = [...content.matchAll(importRegex)];

const fileLayer = LAYERS.find(l => filePath.includes(`/src/${l}/`));
if (!fileLayer) process.exit(0);

const fileLayerIdx = LAYERS.indexOf(fileLayer);
let violations = 0;
for (const m of matches) {
  const importPath = m[1];
  for (const targetLayer of LAYERS) {
    if (importPath.startsWith(targetLayer + "/") || importPath.includes(`/${targetLayer}/`)) {
      const targetIdx = LAYERS.indexOf(targetLayer);
      if (targetIdx <= fileLayerIdx) {
        console.log(
          `VIOLATION: upward import (${fileLayer} → ${targetLayer}) in ${filePath} — mover para layer superior ou inverter`
        );
        violations++;
      }
    }
  }
}
process.exit(violations > 0 ? 1 : 0);
```

### 6.4. Plugando no run-linter

O hook chama via `scripts/lib/run-linter-cli.mjs` quando o arquivo casa com `applyTo:` do standard. A saída `VIOLATION:` é injetada no contexto do agente como mensagem do sistema.

---

## 7. Camada Runtime — 4 hooks que enforcement isso tudo

| Camada | Trigger          | Script                                           | Função                                                                |
|--------|------------------|--------------------------------------------------|-----------------------------------------------------------------------|
| 1      | `SessionStart`   | `scripts/lib/context-index-cli.mjs`              | Lista standards + refs + status MCP                                   |
| 2      | `Read/Edit/Write`| `scripts/lib/edit-nudge-cli.mjs`                 | Mostra standards aplicáveis ao path + libs sugeridas via MCP          |
| 3      | (interno)        | rule extraction (princípios + anti-patterns)     | Extrai regras do .md para injetar no nudge                            |
| 4      | post-tool        | `scripts/lib/run-linter-cli.mjs`                 | Roda o linter machine e converte `VIOLATION:` em system message       |

### 7.1. Camada 1 em ação (SessionStart)

```bash
node scripts/lib/context-index-cli.mjs --project=tests/2026-05-11 --format=text
```

Saída (truncada): a mesma do §4.3.

### 7.2. Camada 2 em ação (Edit nudge)

```bash
echo '{"tool":"Edit","path":"src/components/Header.tsx"}' \
  | node scripts/lib/edit-nudge-cli.mjs --project=tests/2026-05-11
```

Saída real:

```
DevFlow: Edit em src/components/Header.tsx
Standards aplicáveis: std-biome, std-react, std-typescript, std-zod
Refs MCP-indexed: biome@2.0.0, react@19.2.0, typescript@5.9.0, zod@4.1.0
  → query: mcp__docs-mcp-server__search_docs(<lib>, "<question>")

### Regras de std-biome (primeira aparição)
#### Princípios
Adotar Biome 2.x como linter e formatter ...
#### Anti-patterns
| Errado | Certo |
|---|---|
| coexistir com .eslintrc* ou .prettierrc* | Aplicar a alternativa da ADR |

### Regras de std-react (primeira aparição)
#### Princípios
Adotar React 19.2.x ... Server Components por padrão em app/ ...
```

Características:
- **Ruído controlado:** ≤5 standards por arquivo, services com `applyTo:[]` silenciados.
- **Backend não vê stds frontend:** `Edit backend/api.py` retorna apenas `std-python`, `std-pydantic`, `std-fastapi`, `std-pytest`, `std-ruff` — zero `std-typescript`.
- **Cache:** primeira aparição de cada std é injetada uma única vez por sessão (state em `.context/cache/session-injected.json`).

---

## 8. Fluxo end-to-end (do briefing à enforcement)

```
1. Dev escreve briefing            → tests/2026-05-11/_prompts_in/019-adr-fsd.prompt.md
2. /devflow adr:new --mode=prefilled
   ↓ devflow:adr-builder
   ↓ adr-audit.mjs (12 checks)
3. ADR salva                       → .context/adrs/021-adr-feature-sliced-design-frontend-v1.0.0.md
4. node scripts/adr-extract-stacks.mjs --add
   → manifest entry adicionada     → .context/stacks/manifest.yaml
5. Skill devflow:standards-builder mode=FROM-ADR
   → standard humano               → .context/standards/std-feature-sliced-design.md
   → standard machine (esqueleto)  → .context/standards/machine/std-feature-sliced-design.js
6. Dev preenche o linter machine (rule check real)
7. Próxima sessão: SessionStart hook (Camada 1) lista 20 stds + 14 refs MCP
8. Dev edita src/features/auth/model/use-auth.ts
   → edit-nudge (Camada 2) sugere std-react + std-typescript + std-feature-sliced-design
   → run-linter (Camada 4) roda machine/std-feature-sliced-design.js
   → VIOLATION: upward import (features → widgets) ...
```

---

## 9. Validação E2E (rodando o teste real)

A fixture `tests/2026-05-11/` é integralmente coberta por `tests/integration/test-e2e-2026-05-11.mjs`:

```bash
node --test tests/integration/test-e2e-2026-05-11.mjs
```

Asserções principais:

| Teste                                        | Garante                                                              |
|---------------------------------------------|-----------------------------------------------------------------------|
| `fixture: 21 ADRs, 20 standards, 14 entries`| Coerência ADR ↔ std ↔ manifest                                        |
| `manifest: todas têm mcpIndexed:true`       | Paradigma novo, zero `artisanalRef:` legacy                          |
| `Camada 1: 20 stds + 14 refs mcp-indexed`   | context-index funciona + status correto                              |
| `Camada 1: text render aponta MCP search`   | UI textual referencia `mcp__docs-mcp-server__search_docs`            |
| `Camada 1: services com applyTo:[]`         | Task #70 — silenciamento controlado                                  |
| `Camada 2: nudge aponta MCP search`         | Edit/Read/Write hook usa MCP (não arquivos .md locais)               |
| `Camada 2: backend/api.py: zero std-ts`     | Cross-stack contamination = zero                                     |
| `Task #70: src/foo.ts ≤5 stds matched`     | Ruído controlado por arquivo                                         |
| `Performance: hook latency`                 | < 2s no SessionStart (5 runs avg)                                    |

Para rodar com o Docker MCP server (validação opcional de `mcp__docs-mcp-server__list_libraries`):

```bash
SKIP_NETWORK_TESTS=0 node --test tests/integration/test-e2e-2026-05-11.mjs
```

---

## 10. Checklist do desenvolvedor

Antes de declarar "minha decisão arquitetural está enforcing":

- [ ] ADR existe em `.context/adrs/` e passa `adr-audit.mjs --enforce-gate`
- [ ] Stack aparece em `.context/stacks/manifest.yaml` com `mcpIndexed:true`
- [ ] Standard `.md` existe em `.context/standards/` com `relatedAdrs:[<adr-name>]`
- [ ] Linter machine `.js` em `.context/standards/machine/` implementa rule check real (não esqueleto TODO)
- [ ] `context-index --format=text` lista o std e o ref como ✓
- [ ] `edit-nudge` em arquivo do escopo aponta o std esperado
- [ ] (Se aplicável) MCP `search_docs(<lib>, "<query>")` retorna conteúdo

---

## Apêndice — Referência rápida de comandos

```bash
# ADR
/devflow adr:new --mode=prefilled              # criar ADR
/devflow adr:audit 021                         # auditar (inline, sem PREVC)
/devflow adr:evolve 021                        # evoluir (PREVC SMALL)

# Stacks
node scripts/adr-extract-stacks.mjs --add      # extrair stacks de ADRs → manifest

# Index + nudge
node scripts/lib/context-index-cli.mjs --project=. --format=text|json
echo '{"tool":"Edit","path":"src/x.ts"}' | node scripts/lib/edit-nudge-cli.mjs --project=.
node scripts/lib/edit-nudge-cli.mjs --project=. --clear         # reset cache de sessão

# Linter
node scripts/lib/run-linter-cli.mjs <file>     # roda machine std contra file

# E2E
node --test tests/integration/test-e2e-2026-05-11.mjs
```

---

**Fontes vivas (este projeto):**
- Branch: `feat/context-layer-v2`
- Fixture: `tests/2026-05-11/`
- Teste E2E: `tests/integration/test-e2e-2026-05-11.mjs`
- Skills: `devflow:adr-builder`, `devflow:standards-builder`, `devflow:context-sync`
- Comandos: `/devflow adr`, `/devflow init`, `/devflow config`, `/devflow:devflow-sync`
