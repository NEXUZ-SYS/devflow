# Plano — Seleção de agentes/skills por perfil de framework (Odoo)

> Status: **PROPOSTO** (aguardando aprovação) · Escala: MEDIUM · Fluxo: PREVC · TDD obrigatório
> Decisões do usuário: (1) Perfis de framework · (2) Template genérico no plugin · (3) Plano primeiro

## 1. Objetivo

Fazer o DevFlow **detectar o framework de um projeto** (a começar por Odoo) e, a partir disso,
**scaffoldar e despachar agentes/skills específicos** daquele framework — sem hardcodar cada
framework no código de scaffold. O `odoo-specialist` + skills `odoo-development` e
`frontend-specialist-odoo` passam a ser ativados automaticamente em projetos Odoo.

## 2. Estado atual (diagnóstico)

| Onde | Problema |
|------|----------|
| `skills/project-init/SKILL.md:434-447` (agentes) | Tabela "Project Type → Agents" só tem dimensões genéricas (CLI/Web/API/...). Sem dimensão de framework. Stack detectado vai pro `codebase-map.json` mas **não** alimenta seleção. |
| `skills/project-init/SKILL.md:478-488` (skills) | Mesma tabela fixa. Skills de framework nunca copiadas para `.context/skills/`. |
| `skills/agent-dispatch/SKILL.md:12-32,47-58` | Lista **hardcoded de 15 agentes**; sem discovery dinâmico; sem keyword `odoo`. |
| `agents/odoo-specialist.md:105-108` | Referencia `architect-specialist` (não existe — é `architect`). Ref quebrada. |
| `agents/odoo-specialist.md:24-25` | Referencia skills em `.context/skills/...` que nunca são populadas. |
| `agents/odoo-specialist.md:213-218` | Vaza paths NXZ (`~/Documentos/...`), DBs e portas para **todo** projeto que instalar o plugin. |

Precedente arquitetural a seguir: sistema de **runtimes** (`omp`) — `project-init` Step 0.5 + Step 4.6
já faz "enriquecimento condicional por ambiente". Perfis de framework são análogos.

## 3. Arquitetura proposta

Camada de dados (perfis) + detector (script) + wiring (edição dos SKILL.md). Sem dependência nova:
YAML é lido pelo `parseYaml` caseiro de `scripts/lib/frontmatter.mjs`.

### 3.1 Schema de perfil — `profiles/<framework>.yaml` (raiz do plugin)

```yaml
# profiles/odoo.yaml
framework: odoo
displayName: Odoo
detect:
  files: ["__manifest__.py", "__openerp__.py"]   # presença em qualquer nível (até profundidade N)
  manifestDeps:
    pyproject.toml: ["odoo", "openerp"]
    requirements.txt: ["odoo", "openerp"]
agents: [odoo-specialist]
skills: [odoo-development, frontend-specialist-odoo]
dispatchKeywords:
  odoo-specialist: ["odoo", "owl", "qweb", "pos", "nfc-e", "nf-e", "l10n_br", "addon", "orm"]
```

### 3.2 Detector — `scripts/lib/detect-framework.mjs`

- `loadProfiles(pluginRoot)` → lê `profiles/*.yaml` via `parseYaml`, valida shape mínimo.
- `detectFrameworks(projectRoot, pluginRoot)` → para cada perfil aplica `detect` (arquivo presente
  até profundidade ~3, OU dependência presente em manifesto). Reusa helpers de `manifest-stacks.mjs`
  quando útil. Retorna lista de perfis ativos.
- Modo CLI: `node scripts/lib/detect-framework.mjs <projectRoot>` imprime JSON (consumível pelos skills).

### 3.3 Wiring nos skills (markdown — instruções para o LLM)

- **`project-init` Step 3c-1**: após stack detection, rodar `detect-framework.mjs`; registrar perfis ativos.
- **`project-init` Step 3c-3 (agentes)**: conjunto = tabela base ∪ `profile.agents`.
- **`project-init` Step 3c-4 (skills)**: conjunto = tabela base ∪ `profile.skills`; **copiar** os diretórios
  de skill do perfil (`skills/<slug>/`) do plugin para `.context/skills/<slug>/`.
- **`project-init` (template fill)**: ao scaffoldar `odoo-specialist`, preencher placeholders de ambiente
  (paths/DBs/portas) a partir do scan/perguntas — nunca herdar valores NXZ do plugin.
- **`agent-dispatch`**: (a) discovery dinâmico — descobrir agentes via frontmatter `agentType` em
  `agents/` (plugin) e `.context/agents/` (projeto), além dos 15 fixos; (b) keywords de `dispatchKeywords`
  dos perfis ativos no roteamento Lite.
- **`context-sync`**: idem project-init para manter perfis em sync ao re-rodar.

### 3.4 Sanitização do `agents/odoo-specialist.md` (template genérico)

- Corrigir `architect-specialist` → `architect` (todas as ocorrências).
- Substituir tabela "Ambientes de Desenvolvimento" e paths/DBs/portas NXZ por **placeholders**
  preenchíveis no init (ex.: `<AMBIENTE>`, `<DB>`, `<PORTA>`), marcando a seção como template.
- Remover/parametrizar referências cravadas a "NXZ ERP" onde forem específicas do projeto.
- Manter `agentType: odoo-specialist` no frontmatter.

## 4. Sequência TDD (RED → GREEN → REFACTOR)

1. **RED** — escrever os 3 testes (§5) antes de qualquer código. Todos falham.
2. **GREEN detector** — criar `profiles/odoo.yaml` + `scripts/lib/detect-framework.mjs` → passa `test-detect-framework` e `test-framework-profiles-integrity`.
3. **GREEN refs** — sanitizar `odoo-specialist.md` (fix `architect-specialist`, remover paths NXZ) → passa `test-odoo-specialist-refs`.
4. **GREEN wiring** — editar `project-init`, `agent-dispatch`, `context-sync` (instruções).
5. **REFACTOR** — extrair helpers comuns; rodar suíte completa; revisão (code-reviewer) na fase V.

## 5. Testes (reais, executáveis — não content-checks; fixtures em tmpdir, sem mutar dirs versionados)

1. `tests/integration/test-detect-framework.mjs`
   - tmpdir com `addons/foo/__manifest__.py` → detecta `odoo`.
   - tmpdir com `pyproject.toml` contendo `odoo` → detecta `odoo`.
   - tmpdir node puro (`package.json` react) → **não** detecta `odoo`.
2. `tests/integration/test-framework-profiles-integrity.mjs`
   - todo `profiles/*.yaml` parseia e tem `framework`, `detect`, `agents`, `skills`.
   - todo agent listado existe como `agents/<name>.md`.
   - todo skill listado existe como `skills/<slug>/SKILL.md`.
3. `tests/integration/test-odoo-specialist-refs.mjs`
   - todo `.context/agents/X.md` referenciado no corpo tem `agents/X.md` correspondente (pega `architect-specialist` → RED inicial).
   - sem paths NXZ hardcoded no corpo (regex `~/Documentos`, nomes de DB/porta) → RED inicial.

## 6. Riscos e guardrails

- **Compat dotcontext**: perfis vivem em `profiles/` (fora de `.context/`), não quebram o contrato v2.
- **Não mutar versionado nos testes** (incidente FSD): toda fixture em `mkdtemp` tmpdir.
- **Skills são markdown** lido pelo LLM: o wiring é edição de SKILL.md; o que é testável é o detector + integridade referencial dos perfis.
- **Discovery dinâmico** não deve sobrescrever os 15 fixos nem quebrar Minimal mode.

## 7. Fora de escopo (futuro)

- Perfis para outros frameworks (Rails, Django, Next.js) — o schema já suporta; criar sob demanda.
- UI interativa para escolher/confirmar perfis detectados no init (pode reusar AskUserQuestion).
- Migração automática de agentes de projeto NXZ existentes para o novo formato template.
