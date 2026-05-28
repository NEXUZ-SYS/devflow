---
name: memory-ops
description: "Run MemPalace ingestion and maintenance operations — mine, wake-up, status, sweep, sync — scoped to the project wing"
---

# Memory Ops

Executa as operações de ingestão e manutenção do MemPalace via CLI, sempre escopadas à wing do projeto. Complementa `devflow:memory-recall` (que faz a **busca**) — este skill **escreve/mantém** o palace.

**Announce at start:** "I'm using the devflow:memory-ops skill to run a MemPalace operation."

## Pre-requisite

Verifique que o CLI do MemPalace está disponível:

```bash
command -v mempalace
```

- Se encontrado → prossiga.
- Se não → informe: "MemPalace não está instalado. Instale com `uv tool install mempalace` (ou `pipx install mempalace`) e registre o MCP com `claude mcp add mempalace -- mempalace-mcp`."

> Use sempre o binário `mempalace` no PATH. **Nunca** invoque `python -m mempalace.mcp_server` — esse é o servidor MCP (stdio), não o CLI de operações.

## Step 1: Resolver wing e raiz do projeto

A wing escopa as operações ao projeto atual (evita misturar memórias entre repos).

1. Raiz do projeto: `git rev-parse --show-toplevel` (fallback: diretório atual).
2. Wing: ler `mempalace.wing` em `.context/.devflow.yaml`.
   - Se ausente ou `auto` → wing = `basename` da raiz do projeto.
3. Palace: `mempalace.palace` em `.context/.devflow.yaml` se definido; senão o default do CLI (`~/.mempalace/palace`). Passe `--palace <path>` apenas se o config definir um caminho customizado.

## Step 2: Mapear subcomando → CLI

| Subcomando | Comando executado |
|---|---|
| `mine` | `mempalace mine <project-root> --wing <wing>` |
| `mine --convos` | `mempalace mine ~/.claude/projects/ --mode convos --wing <wing>` |
| `mine --dry-run` | acrescenta `--dry-run` ao comando de mine |
| `wake-up` | `mempalace wake-up --wing <wing>` |
| `status` | `mempalace status` |
| `sweep` | `mempalace sweep <project-root>` |
| `sync` | `mempalace sync --wing <wing> --dry-run` |
| `sync --apply` | `mempalace sync --wing <wing> --apply` |
| `install-hook` | `bash "$CLAUDE_PLUGIN_ROOT/scripts/install-git-hook.sh" <repo-root>` |

Combine flags conforme passadas (ex.: `mine --convos --dry-run`).

### `install-hook` — auto-mine no post-merge

Instala o git hook `post-merge` que minera o projeto automaticamente sempre que um merge/pull aterrissa numa branch protegida (pega tanto `gh pr merge`+`git pull` do autoFinish quanto `git merge`/`git pull` no terminal).

1. Rodar `bash "$CLAUDE_PLUGIN_ROOT/scripts/install-git-hook.sh" "$(git rev-parse --show-toplevel)"`.
2. Se o instalador avisar que já existe um hook `post-merge` **alheio**, NÃO sobrescrever — repassar ao usuário as instruções de encadeamento que o script imprime.
3. Informar que o comportamento é controlado por `mempalace.autoMine` no `.devflow.yaml` (`post-merge` = ativo/default; `off` = desativa sem precisar desinstalar). Para remover de vez: `rm <repo>/.git/hooks/post-merge`.
4. O hook é **não-bloqueante** (roda em background) e **fail-safe** (nunca quebra o git); minera incrementalmente + `sync --apply` na wing do projeto.

## Step 3: Salvaguardas (antes de executar)

- **`mine --convos`** lê `~/.claude/projects/` inteiro e grava no palace global — pode ser **lento e grande**. Avise e prossiga (o usuário já optou pela flag explícita).
- **`sync --apply`** **remove drawers** de forma definitiva. Antes de executar `--apply`, rode/mostre o `--dry-run` e confirme com o usuário o que será removido.
- `mine`/`sweep`/`sync` escrevem no palace **global** (`~/.mempalace`), não em arquivos versionados do projeto.

## Step 4: Executar e formatar

1. Execute o comando via Bash (use `run_in_background` se o `mine` tender a demorar).
2. Resuma a saída: quantos drawers filed/skipped, wing/rooms afetados, tempo. Para `status`, apresente a tabela de wings/rooms. Para `wake-up`, mostre o contexto carregado.
3. Em erro, mostre a mensagem do CLI e sugira o próximo passo (ex.: rodar `mempalace init <project-root>` se a wing não existir ainda).

## Guidelines

- Sempre escope por `--wing` (exceto `status`, que é global por natureza).
- Não rode `mine --convos` "por garantia" — só quando a flag for passada.
- Este skill não faz busca semântica — para isso, use `devflow:memory-recall` / `/devflow:recall`.
- Se a wing ainda não existe no palace, oriente rodar `mempalace init <project-root>` primeiro.
