---
name: memory
description: Run MemPalace operations — mine, wake-up, status, sweep, sync
user_invocable: true
---

# /devflow:memory

Operações do MemPalace (memória semântica persistente): minerar conteúdo no palace, carregar contexto, inspecionar e manter os drawers.

> A **busca** semântica fica em `/devflow:recall <query>`. Este comando cobre as operações de ingestão e manutenção.

## Usage

```
/devflow:memory mine                # minera os arquivos do projeto atual (wing = repo)
/devflow:memory mine --convos       # minera sessões do Claude Code (~/.claude/projects/, --mode convos)
/devflow:memory mine --dry-run      # prévia, sem gravar no palace
/devflow:memory wake-up             # carrega o contexto L0+L1 da wing do projeto
/devflow:memory status              # inventário do palace (wings/rooms/drawers)
/devflow:memory sweep               # minerador tandem — pega transcripts que o mine primário perdeu
/devflow:memory sync                # prévia de drawers órfãos (gitignored/deletados/movidos)
/devflow:memory sync --apply        # remove de fato os drawers órfãos da wing do projeto
```

## Behavior

1. Parse the subcommand and flags
2. Invoke `devflow:memory-ops` skill
3. The skill detecta o MemPalace, resolve a wing do projeto a partir de `.context/.devflow.yaml`, executa o comando `mempalace` correspondente e formata o resultado

## Arguments

- `mine` — minera o projeto (`--mode projects`, padrão). `--convos` muda para sessões do Claude Code; `--dry-run` apenas prévia
- `wake-up` — contexto de inicialização da wing do projeto
- `status` — inventário do palace
- `sweep` — minerador tandem (captura o que o mine primário deixou passar)
- `sync` — poda drawers órfãos (dry-run por padrão; `--apply` executa a remoção)

## Examples

```
/devflow:memory mine
/devflow:memory mine --convos
/devflow:memory wake-up
/devflow:memory status
/devflow:memory sync --apply
```
