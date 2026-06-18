# Bug: pre-tool-use nega todo Edit/Write quando o evento chega sem `cwd`

- **Data:** 2026-06-18
- **Versão afetada:** 1.22.0 (provavelmente todas que têm o gate de config no `pre-tool-use`)
- **Arquivo:** `hooks/pre-tool-use`
- **Severidade:** Alta — bloqueia 100% das edições (`Edit`/`Write`) na sessão, mesmo com `.context/.devflow.yaml` válido e em branch de trabalho não-protegida.
- **Status:** ✅ Corrigido em v1.23.1 — fallback `${CWD:-$PWD}` aplicado no bloco de config; regressão coberta pelos testes 15/16 em `tests/hooks/test-pre-tool-use.sh` (suíte 22/22).

## Sintoma

Toda chamada de `Edit`/`Write` é negada com:

```
DevFlow não está configurado para este projeto. Execute /devflow config para
definir sua estratégia git antes de editar arquivos.
Isso é necessário para o DevFlow saber quais branches proteger e como gerenciar seu workflow.
```

Rodar `/devflow config` **não** resolve: o `.context/.devflow.yaml` existe e é válido
(`git.strategy: branch-flow`, `protectedBranches: [master, develop]`, etc.). O problema
não é a config — é o hook não conseguir **localizá-la**.

## Causa raiz

No bloco que resolve o caminho da config, o hook usa **apenas `$CWD`**, sem o
fallback `${CWD:-$PWD}` que o próprio arquivo já aplica em todos os outros pontos:

```sh
# hooks/pre-tool-use (~283-296)
DEVFLOW_CONFIG=""
if [ -n "$CWD" ]; then
  DEVFLOW_CONFIG="$CWD/.context/.devflow.yaml"
fi

if [ -z "$DEVFLOW_CONFIG" ] || [ ! -f "$DEVFLOW_CONFIG" ]; then
  if is_nonproject_path "$FILE_PATH"; then
    emit_ask_nonproject "$FILE_PATH" "$BRANCH"
    exit 0
  fi
  # ... DENY com MSG_NO_CONFIG ...
fi
```

`$CWD` vem de `d.get('cwd', '')` do JSON do evento (linhas ~30-33). Quando o harness
**não envia `cwd`** no evento `PreToolUse` (observado no Claude Code desta máquina),
`$CWD` fica vazio → `DEVFLOW_CONFIG` vazio → o hook conclui "sem config" → **DENY**
para qualquer path de projeto.

### Inconsistência interna (a prova)

O mesmo arquivo já trata `cwd` ausente com fallback para `$PWD` em **3 outros lugares**:

| Linha | Código |
|------:|--------|
| 46  | `PERMS_DIR="${CWD:-$PWD}"` |
| 115 | `GROUNDING_CONFIG="${CWD:-$PWD}/.context/.devflow.yaml"` |
| 178 | `PROJECT_ROOT="${CWD:-$PWD}"` |
| **286** | `DEVFLOW_CONFIG="$CWD/.context/.devflow.yaml"`  ← **sem fallback (bug)** |

Quando o hook roda, seu `$PWD` é a raiz do projeto (a mesma usada por linhas 46/115/178),
então o fallback resolveria a config corretamente.

## Evidência (simulação do hook)

```
# COM cwd no input  -> libera
printf '{"tool_name":"Write","tool_input":{"file_path":".../data/x.xml","content":"x"},"cwd":"<proj>"}' \
  | hooks/run-hook.cmd pre-tool-use
[exit 0]   # sem deny

# SEM cwd no input  -> nega (reproduz o sintoma exato)
printf '{"tool_name":"Write","tool_input":{"file_path":".../data/x.xml","content":"x"}}' \
  | hooks/run-hook.cmd pre-tool-use
{ "permissionDecision": "deny", "permissionDecisionReason": "DevFlow não está configurado..." }
[exit 0]
```

## Correção proposta (1 linha)

Aplicar o mesmo fallback dos demais pontos. Em `hooks/pre-tool-use`, trocar o bloco:

```sh
DEVFLOW_CONFIG=""
if [ -n "$CWD" ]; then
  DEVFLOW_CONFIG="$CWD/.context/.devflow.yaml"
fi
```

por:

```sh
DEVFLOW_CONFIG="${CWD:-$PWD}/.context/.devflow.yaml"
```

(ou manter o `if` mas usar `RESOLVED_DIR="${CWD:-$PWD}"`.) Assim o gate de config passa
a se comportar como os blocos de permissions/grounding, que já são robustos a `cwd` vazio.

## Observação sobre o CHANGELOG 1.22.0

O CHANGELOG 1.22.0 descreve um fix relacionado, mas **apenas para paths não-projeto**
(auto-memory / napkin → emite `ask` em vez de `deny`). O caminho de **path de projeto**
continua chamando `deny` quando `cwd` está vazio. A correção acima cobre os dois casos
(com config localizada via `$PWD`, o fluxo nem chega no ramo de deny).

## Risco da não-correção

Em qualquer harness/versão do Claude Code que não popule `event.cwd` no `PreToolUse`,
o DevFlow fica **inoperante para edição** — o usuário não consegue editar nada e
`/devflow config` não ajuda (a config existe; o hook é que não a acha). Workarounds atuais:
patch manual no cache do plugin (perdido a cada update) ou escrever via `Bash` (que o
matcher `Edit|Write` não intercepta).
