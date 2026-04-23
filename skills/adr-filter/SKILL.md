---
name: adr-filter
description: "Use para selecionar apenas as ADRs relevantes à task atual em vez de carregar todas — reduz ruído de contexto em projetos com muitas ADRs mantendo o enforcement. Invoque no início do PREVC Planning (após o task ser definida) ou sob demanda quando o usuário pedir 'filtre as ADRs para X' ou mencionar que há muitas ADRs ativas. Usa o README.md das ADRs como índice semântico e detecção de filesystem (pyproject.toml/package.json/go.mod/Cargo.toml) com fallback de precaução."
---

# adr-filter — Filtragem Contextual de ADRs

Seleciona as ADRs relevantes a uma task específica em vez de dumpar todas as aprovadas. Complementa (não substitui) a injeção eager do session-start hook.

## Quando invocar

- **Automaticamente** — durante `devflow:prevc-planning` Step 1, **depois** que a task está definida
- **Sob demanda** — usuário diz "filtre as ADRs para esta task X", ou menciona ter muitas ADRs ativas e querer foco

**Não invoque** se `.context/docs/adrs/README.md` não existir. Skill é no-op nesse caso.

## Anuncie ao iniciar

"Invocando `devflow:adr-filter` para selecionar ADRs relevantes a esta task."

## Processo

### Step 1 — Ler o índice

Leia `.context/docs/adrs/README.md`. Extraia a tabela com: número, título, stack, categoria, status, descrição. Filtre apenas as com `status: Aprovado`.

Se o README não tiver a tabela no formato esperado, caia para o comportamento antigo (carregar todas as ADRs aprovadas) e avise o usuário que o índice está mal formado.

### Step 2 — Entender a task

Receba a descrição da task (do argumento, do plano PREVC em andamento, ou do último turno do usuário). Extraia dois sinais:

1. **Stacks mencionadas explicitamente** — palavras-chave como `Python`, `Go`, `React`, `TypeScript`, `AWS`, `S3`, `Athena`, `Terraform`, `Rust`, etc. Tanto linguagens quanto plataformas.

2. **Tópicos/categorias** — identifique semanticamente o foco: `autenticação`, `arquitetura`, `persistência`, `infraestrutura`, `UI`, `testes`, `segurança`, etc.

### Step 3 — Stack resolution (2-tier fallback)

Determine o conjunto de stacks **do projeto** para filtragem:

| Situação | Ação |
|----------|------|
| Task menciona linguagens explicitamente (ex: "em Python", "componente React") | Use essas como stacks do projeto |
| Task NÃO menciona linguagem | Rode `bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project-stack.sh"` |
| Detecção retornou stacks (ex: `python`, `typescript`) | Use essas |
| Detecção retornou vazio | **Precaução — inclua todas as ADRs de linguagem** (falso positivo é preferível a falso negativo) |

Observação sobre plataformas: ADRs com `stack: aws`/`terraform`/`cdk` **NUNCA** são incluídas por detecção de filesystem. Elas dependem exclusivamente da task mencionar o tema (AWS, S3, Athena, Terraform...).

### Step 4 — Filtrar

Para cada ADR aprovada, aplicar em ordem:

**4a. Filtro de stack:**
- `stack: universal` → sempre passa
- `stack: <linguagem>` que é uma das stacks resolvidas → passa
- `stack: <linguagem>` que NÃO é das stacks resolvidas → rejeita
- `stack: <plataforma>` (aws, terraform, etc.) → passa **apenas se** a task mencionou essa plataforma explicitamente

**4b. Filtro semântico (sobre as que passaram em 4a):**
- A descrição da ADR se conecta com a task? (tema, categoria, sub-domínio)
- Em dúvida, **incluir** — falso positivo é preferível a falso negativo
- Só rejeite se for claramente off-topic (ex: ADR de patterns de UI quando task é sobre pipeline de dados backend)

### Step 5 — Carregar guardrails

Para cada ADR que passou em Step 4, abra `.context/docs/adrs/<nn>-<slug>.md` e extraia a seção `## Guardrails` (SEMPRE/NUNCA/QUANDO).

### Step 6 — Emitir bloco

Formato de saída (mesma tag `<ADR_GUARDRAILS>` do hook, com `filtered="true"` para diferenciar):

```
<ADR_GUARDRAILS filtered="true">
Loaded N of M active ADR(s), filtered for task: "<descrição curta da task>".
Signals: stacks=[...], topics=[...]. Detection=[filesystem|task-mentioned|precaution].

### <adr-name> (stack: <stack>)
<guardrails>

### <adr-name> (stack: <stack>)
<guardrails>
</ADR_GUARDRAILS>
```

Se M = N (nenhuma foi filtrada), diga explicitamente: `"Nenhuma ADR foi filtrada — todas aplicam a esta task."` Isso evita impressão de que o filtro quebrou.

## Exemplo concreto

Task: *"adicionar endpoint POST /auth/login em Python com validação JWT"*

1. **Ler índice** → 6 ADRs aprovadas
2. **Sinais da task** → stacks=[python], topics=[auth, jwt, endpoint]
3. **Stack resolution** → Tier 1 (Python mencionado explicitamente) → `[python]`
4. **Filtrar:**
   - `001 tdd-python` (python, qualidade-testes) → ✅ stack bate + todo código novo precisa TDD
   - `002 code-review` (universal) → ✅ universal sempre passa
   - `003 jwt-auth` (universal, seguranca) → ✅ universal + tópico JWT explícito
   - `004 hexagonal` (universal, arquitetura) → ❌ semântico: arquitetura não é o foco
   - `005 aws-data-lake` (aws, infra) → ❌ aws não mencionado
   - `006 react-patterns` (typescript, arquitetura) → ❌ stack errada
5. **Carregar guardrails** de 001, 002, 003
6. **Emitir** bloco com 3 de 6 (redução de 50%)

## Interação com outros componentes

- **session-start hook (v0.11.0)** — Continua injetando `<ADR_GUARDRAILS>` eager com **todas** as ADRs aprovadas. Essa skill emite um bloco **adicional** e **focado** quando invocada. Ambas são complementares: o hook dá awareness baseline, a skill dá foco na task ativa.
- **devflow:prevc-planning** — O Step 1 dessa skill (adr-filter) substitui a "ADR Guardrails Loading" eager que carregava todas.
- **devflow:context-awareness** — Se invocada junto, o filter fica na frente — guardrails focados valem mais que contexto genérico.

## Anti-patterns

- **Filtrar por stack quando a task menciona explicitamente** — não reverta, task wins sobre detecção
- **Pular categoria (filtro semântico) apenas por falta de match direto** — em dúvida, incluir
- **Incluir ADR `stack: aws` em projeto Python porque detecção falhou** — aws é plataforma, não se inclui por precaução; depende de menção explícita na task
