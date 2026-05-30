---
name: migration
description: "Front-end interativo para migrar o layout de .context/ de v1 (subsistemas no topo) para v2 (DDC 4 camadas; subsistemas sob engineering/). Palavras-chave: '/devflow update migration', '/devflow migration', 'migrar layout de contexto', 'migrar para engineering/'."
---

# DevFlow Migration

Migra o layout de `.context/` de v1 (subsistemas no topo) para v2 (DDC — 4 camadas de conhecimento; subsistemas sob `engineering/`).

**Announce at start:** "I'm using the devflow:migration skill to migrate the .context/ layout."

## Propósito

O layout v1 armazenava os subsistemas de engenharia (ADRs, standards, stacks, templates) diretamente na raiz de `.context/`. O layout v2 (DDC) organiza o conhecimento em 4 camadas explícitas:

- `engineering/` — decisões técnicas, standards, stacks, templates
- `business/` — regras de negócio, domínios, objetivos
- `product/` — especificações de produto, roadmap, personas
- `operations/` — runbooks, alertas, SLOs, playbooks

Este skill é um front-end interativo para o runner idempotente `scripts/devflow-migrate.mjs`. Toda a lógica de movimentação real é executada pelo runner — o skill cuida de detecção, preview e confirmação.

## Pré-requisito

Verificar se `.context/` existe no projeto. Se não existir, informar:
> "O diretório .context/ não foi encontrado. Execute `/devflow init` primeiro."

## Fluxo

### Passo 1 — Detectar versão atual do layout

```bash
LAYOUT_VERSION=""
LAYOUT_FILE="<projectRoot>/.context/.layout-version"

if [ -f "$LAYOUT_FILE" ]; then
  LAYOUT_VERSION=$(cat "$LAYOUT_FILE" | tr -d '[:space:]')
fi
```

- Se `LAYOUT_VERSION` for igual a `2`: informar que o projeto **já está migrado** (layout v2) e encerrar.
- Se ausente ou diferente de `2`: interpretar como **v1** e prosseguir.

### Passo 2 — Exibir preview do que será movido

Antes de qualquer alteração, mostrar ao usuário exatamente o que o runner irá fazer:

```
Migração de layout: v1 → v2 (DDC 4 camadas)

  O que será movido:
    .context/adrs/        →  .context/engineering/adrs/
    .context/standards/   →  .context/engineering/standards/
    .context/stacks/      →  .context/engineering/stacks/
    .context/templates/   →  .context/engineering/templates/

  O que será criado (se não existir):
    .context/business/
    .context/product/
    .context/operations/

  O que NÃO será tocado:
    .context/docs/
    .context/agents/
    .context/skills/
    .context/plans/
    (todos os diretórios gerenciados pelo dotcontext permanecem intactos)

  Nota: o runner usa `git mv` quando possível, preservando o histórico dos arquivos.
```

Apenas os diretórios que **existem** no projeto devem aparecer na lista "O que será movido". Se nenhum dos quatro existir, informar que não há nada para mover e encerrar.

### Passo 3 — Confirmar com o usuário (exceto se `--yes`)

Se o skill foi invocado **sem** `--yes`:

```
AskUserQuestion:
  question: "Confirma a migração de layout v1 → v2?"
  header: "Migração de Layout de Contexto"
  multiSelect: false
  options:
    - label: "Sim, migrar agora"
      description: "Executa o runner. Idempotente — pode ser revertido via git."
    - label: "Não, cancelar"
      description: "Sair sem fazer nenhuma alteração"
```

Se o usuário cancelar, encerrar sem tocar em nenhum arquivo.

Se invocado **com** `--yes`, pular esta pergunta e executar diretamente.

### Passo 4 — Executar o runner

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/devflow-migrate.mjs" \
  --project=<projectRoot> \
  --yes
```

- `<projectRoot>` é o diretório raiz do projeto (onde `.context/` reside).
- `CLAUDE_PLUGIN_ROOT` é o diretório raiz deste plugin DevFlow.
- O runner é **idempotente**: executá-lo mais de uma vez é seguro.

Capturar o output do runner para o Passo 5.

### Passo 5 — Reportar resultado

Exibir o que foi movido e o que foi criado a partir do output do runner. Formato sugerido:

```
✅ Migração concluída!

  Movidos:
    ✓ adrs/       →  engineering/adrs/
    ✓ standards/  →  engineering/standards/

  Criados:
    ✓ engineering/business/
    ✓ engineering/product/
    ✓ engineering/operations/

  Layout atualizado para v2 (.context/.layout-version = 2)

  Próximos passos:
    - Commit das mudanças: git add .context/ && git commit -m "chore: migrate .context/ layout to v2"
    - Verificar se referências a .context/adrs/ foram atualizadas no projeto
    - Executar /devflow:devflow-sync para sincronizar o contexto com as ferramentas configuradas
```

Se o runner reportar erros, exibi-los integralmente e sugerir inspeção manual.

## Segurança

- O runner **nunca** toca em `.context/docs/`, `.context/agents/`, `.context/skills/` ou `.context/plans/` — esses diretórios são gerenciados pelo dotcontext e devem permanecer intactos.
- A operação usa `git mv` quando possível, preservando o histórico de cada arquivo.
- O arquivo `.context/.layout-version` é atualizado para `2` ao final de uma migração bem-sucedida.
- Por ser idempotente, rodar o runner em um projeto já migrado é seguro (não-destrutivo).

## Integração

- **`/devflow update migration`** → invoca este skill diretamente
- **`/devflow migration`** → alias, invoca este skill diretamente
- **`/devflow update`** → após Step 6 (post-update), sugere migração quando `.layout-version` está ausente ou `< 2` (opt-in — nunca executa automaticamente)
