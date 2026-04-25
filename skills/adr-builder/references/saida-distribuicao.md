# Saída no DevFlow CLI

DevFlow grava ADRs diretamente em `.context/docs/adrs/NNN-<slug>-v<semver>.md`. Não há staging em diretório temporário, nem empacotamento `.zip` — o working tree git serve como staging, e cada ADR vira um commit (ver Steps 4-5 do SKILL.md).

## Por que `.zip` foi descartado

A versão original desta skill (em `docs/adr-builder.skill`) foi projetada para rodar em sandbox Claude.ai onde o assistente não tem acesso ao filesystem do usuário. Lá, o output natural é um `.zip` que o usuário descompacta no repo. No DevFlow CLI:

- O agente já está no working tree do projeto
- Pode escrever direto em `.context/docs/adrs/`
- Pode commitar via `git`
- O staging é o próprio working tree (uncommitted change)

Logo: nenhum staging intermediário em `/home/claude/adr-build/`, nenhum empacotamento, nenhum `present_files`.

## Distribuição cross-repo (export/import)

A capacidade equivalente às Opções A (repo do time) e C (novo repo `context-adrs-<team>`) do bundle original será adicionada em plan futuro **B1** — `/devflow adr:bundle`:

- `/devflow adr:bundle --create <team>` → empacota ADRs do projeto atual em `.tar.gz` para outro repo consumir
- `/devflow adr:bundle --apply <arquivo.tar.gz>` → consome pacote vindo de outro projeto, valida via `adr-audit.mjs`, propõe merge

Não está no escopo do plan `adr-system-v2` atual. Ver spec §11 (B1) e plan §11 deste workflow para racional.
