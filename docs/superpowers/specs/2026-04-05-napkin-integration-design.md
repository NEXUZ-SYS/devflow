# Napkin Integration — Design Spec

**Data:** 2026-04-05
**Status:** Aprovado
**Referência:** [blader/napkin v6.0.0](https://github.com/blader/napkin)

## Resumo

Integrar o napkin como skill nativa do devflow (`devflow:napkin`) com hooks profundos no workflow PREVC. O napkin é um runbook curado de aprendizados — registra erros, correções e padrões que funcionam para que o agente não repita os mesmos erros entre sessões.

## Decisões de Design

| Decisão | Escolha | Alternativas descartadas |
|---------|---------|--------------------------|
| Tipo de integração | Skill nativa + hooks profundos | Skill pura sem hooks; dependência externa |
| Local do arquivo | `.context/napkin.md` | `.claude/napkin.md` (original) |
| Comportamento de escrita | Contínuo pelo agente (original) | Escrita automática por fase |
| Relação com MEMORY.md | Coexistência independente | Substituição; promoção automática |
| Categorias | 4 fixas + Agent-Specific Notes | Fixas apenas; por agente apenas |
| Caps | 15 por categoria, 7 por agente | 10/5 (original); 20/10 |

## Skill: `devflow:napkin`

### Localização

`skills/napkin/SKILL.md`

### Comportamento

- **Always active** — sem trigger, toda sessão
- Lê, internaliza e aplica silenciosamente (não anuncia)
- Escrita contínua: registra correções, gotchas, padrões em tempo real
- Curadoria a cada leitura: re-priorizar, merge duplicatas, remover stale, enforce caps

### Formato de entrada obrigatório

```markdown
1. **[YYYY-MM-DD] Short rule**
   Do instead: concrete repeatable action.
```

### O que entra

- Gotchas recorrentes
- Directives do usuário que afetam comportamento repetido
- Táticas não-óbvias que funcionam repetidamente

### O que NÃO entra

- Notas cronológicas one-off
- Postmortems verbosos sem ação reutilizável
- Logs de erro sem "Do instead"

### Template inicial

Criado automaticamente quando `.context/` existe mas `napkin.md` não:

```markdown
# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 15 items per category, max 7 per agent section.
- Each item includes date + "Do instead".

## Execution & Validation
(empty)

## Shell & Command Reliability
(empty)

## Domain Behavior Guardrails
(empty)

## User Directives
(empty)

## Agent-Specific Notes
<!-- Sections appear on demand: ### agent-name -->
```

## Integração nos Hooks

### SessionStart (`hooks/session-start.sh`)

1. Checar se `.context/napkin.md` existe
2. Se existe → ler conteúdo e injetar no `additional_context`:
   ```
   <NAPKIN_RUNBOOK>
   [conteúdo do .context/napkin.md]
   </NAPKIN_RUNBOOK>
   ```
3. Se não existe mas `.context/` existe → criar template vazio e injetar
4. Se `.context/` não existe → ignorar (modo Minimal)

### PostToolUse (`hooks/post-tool-use.sh`)

Detectar padrões de retry/correção e emitir nudge:

```
Consider logging this correction in .context/napkin.md
```

**Condições para disparar:**
- Tool denied pelo usuário (indica correção)
- Comando Bash com exit code != 0 seguido de retry

**Não dispara** em operações normais (evita spam).

### PreCompact (`hooks/pre-compact.sh`)

Injetar instrução de curadoria antes de compactar:

```
Before compacting, curate .context/napkin.md: merge duplicates,
remove stale items, enforce max 15 per category / 7 per agent section,
re-prioritize by importance.
```

### PostCompact (`hooks/post-compact.sh`)

Re-injetar o napkin no contexto após compactação:

```
<NAPKIN_RUNBOOK>
[conteúdo atualizado do .context/napkin.md]
</NAPKIN_RUNBOOK>
```

## Interação com Agentes

### Registro por agentes especialistas

Agentes usam a seção `## Agent-Specific Notes` com sub-header do seu nome:

```markdown
## Agent-Specific Notes
### security-auditor
1. **[2026-04-05] XSS via innerHTML no componente de preview**
   Do instead: usar textContent ou sanitizar com DOMPurify

### database-specialist
1. **[2026-04-05] Index missing em account_move_line.partner_id**
   Do instead: verificar EXPLAIN antes de queries em tabelas > 100k rows
```

Seções aparecem sob demanda — sem registro, sem seção.

### Consciência de fase PREVC

Sem lógica condicional por fase. O napkin está sempre no contexto; o agente decide quando escrever baseado no contexto natural:

| Fase | Uso natural |
|------|-------------|
| P (Planning) | Lê guardrails e directives — evita repetir erros de design |
| R (Review) | Consulta padrões que funcionaram/falharam para validar plano |
| E (Execution) | Maior volume de escrita — correções em tempo real |
| V (Validation) | Registra padrões revelados por resultados de testes |
| C (Confirmation) | Curadoria natural — consolida antes de fechar ciclo |

## Modos de Operação

| Modo | Napkin disponível? | Como |
|------|-------------------|------|
| Full | Sim | SessionStart injeta, dotcontext MCP lê `.context/napkin.md` |
| Lite | Sim | SessionStart injeta, leitura direta do arquivo |
| Minimal | Não | Sem `.context/`, napkin inativo |

## Escopo de Implementação

### Arquivos novos

| Arquivo | Propósito |
|---------|-----------|
| `skills/napkin/SKILL.md` | Skill nativa adaptada do napkin v6.0.0 |

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `hooks/session-start.sh` | Bloco de detecção + injeção do napkin |
| `hooks/post-tool-use.sh` | Detecção de retry/correção → nudge |
| `hooks/pre-compact.sh` | Instrução de curadoria antes de compactar |
| `hooks/post-compact.sh` | Re-injeção do napkin após compactação |

### Fora de escopo

- Não modifica playbooks de agentes (`agents/*.md`)
- Não modifica skills existentes (prevc-flow, etc.)
- Não cria comandos CLI novos
- Não toca no MEMORY.md
- Não adiciona dependências externas

## Testes

- Validar que `SKILL.md` tem frontmatter correto (name, description, version)
- Validar que template gerado tem as 4 categorias + seção Agent-Specific Notes
- Validar que SessionStart injeta `<NAPKIN_RUNBOOK>` quando `.context/napkin.md` existe
- Validar que SessionStart cria template quando `.context/` existe mas napkin não
- Validar que SessionStart ignora quando `.context/` não existe
