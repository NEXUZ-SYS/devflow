# Hooks do DevFlow

Este diretório contém hooks do DevFlow. A maioria é gerenciada automaticamente
(`pre-tool-use`, `post-tool-use`, `session-start`, etc.) via `hooks.json`.

Esta seção documenta hooks **opt-in** que o usuário ativa manualmente — eles
**não** são auto-instalados em `.git/hooks`.

## commit-msg-guard — enforcement de Conventional Commits

`hooks/commit-msg-guard.mjs` valida que a mensagem de commit segue
[Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<escopo>)?(!)?: <descrição imperativa>
```

Regras aplicadas:

- **tipo** ∈ `feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert`
- **escopo** opcional, entre parênteses
- **`!`** opcional, para breaking changes
- **descrição** não vazia, no imperativo, **sem ponto final**, e a primeira linha
  inteira com **≤ 72 caracteres**

Exemplos válidos:

- `feat(orders): add idempotency key`
- `fix: prevent redirect loop`
- `feat(auth)!: drop legacy token`

O módulo exporta `isValidConventionalCommit(msg)` (usado nos testes) e, quando
executado diretamente, lê o arquivo de mensagem passado como `argv[2]`, retornando
exit `1` (com mensagem de erro) se a mensagem for inválida, ou `0` caso contrário.

### Ativação (opt-in)

Escolha **um** dos dois canais abaixo. O guard **não** é instalado automaticamente.

#### Opção A — git `commit-msg` hook (local, por repositório)

Crie o hook `commit-msg` apontando para o guard. O git passa o caminho do arquivo
de mensagem como `$1`:

```sh
# .git/hooks/commit-msg
#!/bin/sh
node hooks/commit-msg-guard.mjs "$1"
```

Torne-o executável (`chmod +x .git/hooks/commit-msg`). Esse canal valida **todo**
`git commit` no repositório, independentemente de a operação ter partido do
Claude Code ou do terminal.

#### Opção B — PreToolUse `Bash(git commit*)` (via update-config)

Para enforcement apenas dentro do Claude Code, configure um hook `PreToolUse`
casando `Bash(git commit*)` que rode o guard antes do commit ser executado.
Use a skill `update-config` para registrar o hook em `settings.json`. Essa opção
não cobre commits feitos fora do harness — prefira a Opção A se você quer cobertura
total do repositório.

### Relação com std-commit-hygiene

O standard `std-commit-hygiene` permanece com `linter: null` — ele **não** traz um
linter bundlado e não é executado pelo `run-linter`. O `commit-msg-guard` é o
**canal de enforcement** desse standard: a convenção é descrita no std e a
verificação automatizada vive aqui, ativada opt-in pelo usuário.
