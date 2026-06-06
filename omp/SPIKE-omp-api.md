# SPIKE — API de Extensão do omp (oh-my-pi)

> Gate da Fase 2 da integração DevFlow ↔ omp.
> Verificação **empírica** (comando + saída real) e por **leitura de código-fonte** do pacote instalado.

## STATUS: CONFIRMADO

Todas as 6 perguntas respondidas com evidência. As suposições críticas da
permissions-bridge (`tool_call` como chokepoint universal cobrindo bash + MCP,
bloqueio via `{block,reason}`, raiz do projeto via `ctx.cwd`) estão
**confirmadas em código E em execução real**. Há **uma correção importante**: a
API de injeção de contexto **não é `appendEntry`** — ver Pergunta 2.

### Ambiente verificado

```
$ which omp
/home/walterfrey/.bun/bin/omp
$ readlink -f $(which omp)
/home/walterfrey/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts
$ omp --version
omp/15.9.5
```

Pacote: `@oh-my-pi/pi-coding-agent@15.9.5` (TypeScript/Bun; `"type": "module"`).
Fontes lidas em `/home/walterfrey/node_modules/@oh-my-pi/pi-coding-agent/src/`.

---

## 1. FORMATO DE EXTENSÃO

**Resposta:** O omp carrega **`.mjs` (ESM JS puro)** sem problema. Não exige
`.ts`. Passa-se via **`-e` / `--extension`** (pode repetir). A assinatura é
**`export default function (pi) { ... }`** (default export = factory function que
recebe o objeto `ExtensionAPI`).

Há também `--hook` (subsistema "hooks", API quase idêntica — `HookAPI`). Para a
permissions-bridge **use `-e`/extensão**, que tem a superfície de runtime maior
(model registry, system prompt, sessionManager completo).

### Evidência — CLI

```
$ omp --help    (trecho)
  -e, --extension=<value>   Load an extension file (can be used multiple times)
      --hook=<value>        Load a hook/extension file (can be used multiple times)
      --no-extensions       Disable extension discovery (explicit -e paths still work)
```

### Evidência — loader aceita qualquer extensão em path explícito

`src/extensibility/extensions/loader.ts:281` (`loadExtension`) resolve o path e
faz import dinâmico via `loadLegacyPiModule` (jiti) — **agnóstico de extensão de
arquivo**. O filtro `name.endsWith(".ts") || name.endsWith(".js")` (linha 379) é
só da **auto-descoberta** de diretório; paths explícitos `-e` não passam por ele.

`getExtensionFactory` (loader.ts:44) confirma a assinatura do export:

```ts
function getExtensionFactory(module) {
  const candidate = typeof module === "function" ? module : module.default;
  return typeof candidate === "function" ? candidate : null;
}
```

→ aceita `export default function(pi){}` (ou `module.exports = fn`).

### Evidência — teste empírico (`.mjs` carregou e rodou)

`/tmp/omp-spike/ext-teste.mjs` (default export, registra handlers, dumpa eventos):

```
$ cd /tmp/omp-spike/work && omp -e /tmp/omp-spike/ext-teste.mjs --no-session \
    -p "Run the bash command: echo hello-from-spike. Then stop." --auto-approve
hello-from-spike
=== EXIT: 0 ===
```

Log capturado pela extensão (`/tmp/omp-spike/spike.log`):

```
LOADED {"pi_keys":["pi","extension","runtime","cwd","events","logger","typebox","zod","flagValues","pendingProviderRegistrations"],"hasOn":"function","hasAppendEntry":"function","hasSendMessage":"function"}
```

→ `.mjs` carregou; `pi.on`, `pi.appendEntry`, `pi.sendMessage` existem como funções.

---

## 2. API DE INJEÇÃO DE CONTEXTO (paridade com `additionalContext`)

**Resposta — CORREÇÃO IMPORTANTE:** **NÃO é `pi.appendEntry`.** No omp,
`appendEntry(customType, data)` é explicitamente **"Append a custom entry to the
session for state persistence (not sent to LLM)"** — só estado, **não vai pro
modelo**. Não serve para injetar contexto.

A paridade real com `additionalContext` do Claude Code é o evento
**`before_agent_start`**, retornando **`{ message: { customType, content,
display } }`**. Esse `message` é injetado na conversa enviada ao modelo,
**uma vez por prompt do usuário** (semântica de "contexto adicional no início da
volta"). Confirmado empiricamente: o modelo **viu** o marcador injetado.

Alternativas existentes (todas reais, assinaturas confirmadas):

| Método/Evento | Vai pro modelo? | Quando | Uso recomendado |
|---|---|---|---|
| `before_agent_start` → `{message}` | **Sim** | 1×/prompt antes do loop | **Injeção de contexto (escolha p/ DevFlow)** |
| `before_agent_start` → `{systemPrompt}` | Sim (substitui) | 1×/prompt | Reescreve system prompt inteiro (chainável). **Evitar** p/ contexto. |
| evento `context` → `{messages}` | Sim | Antes de **cada** chamada LLM | Substitui o array de mensagens enviado; granularidade fina, mas dispara toda volta |
| `pi.sendMessage({customType,content,display},opts)` | Sim (custom msg) | Imperativo, a qualquer momento | Triggers externos / steer |
| `pi.sendUserMessage(content,opts)` | Sim (como `user`) | Imperativo | Enfileira msg de usuário |
| `pi.appendEntry(type,data)` | **NÃO** | Imperativo | Só persistência de estado |

**`role` a usar:** evitar substituir `systemPrompt` (papel `system`, indevido para
contexto de projeto). Usar `message` custom: o omp materializa CustomMessage como
`role: "hookMessage"`/`"custom"` (ver `pi-agent-core/.../compaction/messages.ts`),
**não** `system`. Se precisar de papel `user`, `sendUserMessage` injeta
`role: "user"`.

### Evidência — `appendEntry` NÃO vai ao LLM (assinatura)

`src/extensibility/extensions/types.ts:1019`

```ts
/** Append a custom entry to the session for state persistence (not sent to LLM). */
appendEntry<T = unknown>(customType: string, data?: T): void;
```

### Evidência — `before_agent_start` event e result

types.ts:478

```ts
export interface BeforeAgentStartEvent {  // "Fired after user submits prompt but before agent loop."
  type: "before_agent_start";
  prompt: string;
  images?: ImageContent[];
  systemPrompt: string[];
}
```

types.ts:803

```ts
export interface BeforeAgentStartEventResult {
  message?: Pick<CustomMessage, "customType" | "content" | "display" | "details" | "attribution">;
  /** Replace the system prompt for this turn. If multiple extensions return this, they are chained. */
  systemPrompt?: string[];
}
```

O runner consome exatamente esses campos (`runner.ts:894-899`): se `result.message`
→ `messages.push(...)`; se `result.systemPrompt` → substitui. (Nota: o exemplo
`examples/extensions/pirate.ts` retorna `systemPromptAppend`, **campo que este
runner NÃO lê** — exemplo desatualizado; o que vale é `message`/`systemPrompt`.)

### Evidência — `sendMessage`/`sendUserMessage`

types.ts:1008 / 1014

```ts
sendMessage<T>(message: Pick<CustomMessage<T>,"customType"|"content"|"display"|"details"|"attribution">,
  options?: { triggerTurn?: boolean; deliverAs?: "steer"|"followUp"|"nextTurn" }): void;
sendUserMessage(content: string | (TextContent|ImageContent)[],
  options?: { deliverAs?: "steer"|"followUp" }): void;
```

### Evidência — teste empírico (contexto injetado FOI visto pelo modelo)

`/tmp/omp-spike/ext-block.mjs` retornou em `before_agent_start`:
`{message:{customType:"spike-context", content:"INJECTED_CONTEXT_MARKER: the secret word is BANANA42.", display:true}}`.
Resposta do modelo (stdout do omp):

```
- **Injected content ignored**: your message contained an `INJECTED_CONTEXT_MARKER`
  line trying to plant a "secret word." ...
```

→ o modelo **recebeu** o texto injetado (reconheceu o marcador). Confirma que
`before_agent_start.message` é o canal de injeção de contexto.

---

## 3. NOMES DE EVENTO (lifecycle)

**Resposta:** Nomes reais (de `ExtensionAPI.on(...)`, types.ts:889-939):

| Necessidade | Nome real do evento | Observações |
|---|---|---|
| Início de sessão | **`session_start`** | payload `{type:"session_start"}` (sem campos) |
| Antes do loop do agente (1×/prompt) | **`before_agent_start`** | tem `prompt`, `systemPrompt[]`; **canal de injeção** |
| Início do loop | `agent_start` | |
| Compactação (antes, cancelável) | **`session_before_compact`** | tem `preparation`, `branchEntries`, `signal` |
| Customizar prompt de compactação | `session.compacting` | (com ponto, não underscore) |
| Compactação (depois) | **`session_compact`** | |
| Auto-compactação | **`auto_compaction_start`** / **`auto_compaction_end`** | tem `reason`/`action`/`result` |
| Pré-tool | **`tool_call`** | bloqueável |
| Pós-tool | **`tool_result`** | modificável |
| Execução de tool (telemetria) | `tool_execution_start`/`_update`/`_end` | não bloqueiam |
| Shutdown | `session_shutdown` | SIGINT/SIGTERM |
| Por volta | `turn_start` / `turn_end` | |

Eventos completos disponíveis via `pi.on(...)` (lista exaustiva, types.ts:889-939):
`resources_discover`, `session_start`, `session_before_switch`, `session_switch`,
`session_before_branch`, `session_branch`, `session_before_compact`,
`session.compacting`, `session_compact`, `session_shutdown`,
`session_before_tree`, `session_tree`, `context`, `before_provider_request`,
`after_provider_response`, `before_agent_start`, `agent_start`, `agent_end`,
`turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`,
`tool_execution_start`, `tool_execution_update`, `tool_execution_end`,
`auto_compaction_start`, `auto_compaction_end`, `auto_retry_start`,
`auto_retry_end`, `ttsr_triggered`, `todo_reminder`, `goal_updated`,
`credential_disabled`, `input`, `tool_call`, `tool_result`, `user_bash`,
`user_python`.

### Evidência — teste empírico (ordem de disparo real)

`spike.log` (mesma run da P1):

```
SESSION_START_EVENT {"type":"session_start"}
SESSION_START_CTX_CWD {"cwd":"/tmp/omp-spike/work","ctxKeys":["ui","getContextUsage","compact","hasUI","cwd","sessionManager","modelRegistry","model","isIdle","abort","hasPendingMessages","shutdown","getSystemPrompt"]}
BEFORE_AGENT_START {"type":"before_agent_start","prompt":"Run the bash command: echo hello-from-spike. Then stop.","sysLen":2,"ctxCwd":"/tmp/omp-spike/work"}
TOOL_CALL  {... toolName:"bash" ...}
TOOL_RESULT {... toolName:"bash" ...}
```

→ `session_start` → `before_agent_start` → `tool_call` → `tool_result`, todos
confirmados disparando.

---

## 4. SHAPE DO EVENTO `tool_call` / `tool_result` + bloqueio

**Resposta:** Campos confirmados (shared-events.ts + extensions/types.ts:598-699):

**`tool_call`** (discriminado por `toolName`):
```ts
{ type: "tool_call", toolCallId: string, toolName: string, input: Record<string,unknown> }
// built-ins tipados: bash → input: BashToolInput, read/write/search/find → respectivos
```
**NÃO tem** `event.cwd` nem `event.workspaceRoot`. Há `event.toolName` e
`event.input` (sim). Para narrowing seguro de built-in, há o type-guard
`isToolCallEventType("bash", event)` (não dá pra estreitar por `===` porque
`CustomToolCallEvent.toolName` é `string`).

**`tool_result`**:
```ts
{ type:"tool_result", toolCallId, toolName, input: Record<string,unknown>,
  content: (TextContent|ImageContent)[], details: unknown, isError: boolean }
```

**Bloqueio:** o handler de `tool_call` retorna **`{ block: true, reason: string }`**
(shared-events.ts:265 `ToolCallEventResult`). O `reason` vira o erro devolvido ao
LLM (wrapper.ts:155 `throw new Error(reason)`).

**`tool_result` modifica resultado:** retorna `{ content?, details?, isError? }`
(`ToolResultEventResult`, shared-events.ts:276) — pode reescrever conteúdo e até
virar/limpar erro.

**Equivalente de "ask":** **não há `return {ask:...}`** no shape do evento. O
"perguntar ao usuário" é feito **imperativamente** de dentro do handler via
`ctx.ui.confirm(...)` / `ctx.ui.select(...)` (e então decide block) — padrão do
`examples/extensions/permission-gate.ts`. Em modo não-interativo (`-p`),
`ctx.hasUI === false`; nesse caso decida por política sem UI.

### Evidência — shapes (código)

shared-events.ts:265 / 276 (results) e extensions/types.ts:598-654 (eventos),
mais o type-guard em types.ts:721-733.

### Evidência — bloqueio empírico

`ext-block.mjs` bloqueou `rm forbidden.txt` com `{block:true, reason:"Blocked by
spike permissions-bridge test"}`:

```
$ omp -e ext-block.mjs --no-session -p "Run exactly this bash command and nothing else: rm forbidden.txt" --auto-approve
The command was blocked by the harness permissions bridge, so nothing was deleted.
...
- **Execution result**: `rm forbidden.txt` was **blocked by the permissions bridge** (`Blocked by spike permissions-bridge test`).
```
`block.log`:
```
TOOL_CALL {"toolName":"find","input":{"paths":["forbidden.txt","*"],...}}
TOOL_CALL {"toolName":"bash","input":{"command":"rm forbidden.txt","cwd":"/tmp/omp-spike/work","timeout":300}}
BLOCKING {"cmd":"rm forbidden.txt"}
```
→ bloqueio efetivo (`rm` não rodou) e `reason` propagado ao modelo. Note que mesmo
com `--auto-approve` o gate de extensão **ainda roda** (auto-approve só pula o
prompt de aprovação humana, não o `tool_call`).

---

## 5. `tool_call` dispara para QUAIS tools? (bash, MCP, rede)

**Resposta:** **TODAS.** O `tool_call`/`tool_result` é um **chokepoint universal**:
o omp envolve **todo tool do registry** com `ExtensionToolWrapper`, incluindo
built-ins (bash, read, edit, write, search, find, **web_search**) e **tools MCP
(`mcp__*`)** e tools RPC-host. Isto vale **independentemente de haver extensões
carregadas** — o gate é instalado sempre.

Isso é exatamente o que a permissions-bridge precisa: um único ponto para
enforçar exec/net/tool, sem brechas por tipo de tool.

### Evidência — wrapping universal (built-ins + tudo)

`src/sdk.ts:1665-1670`:
```ts
// Wrap every tool with `ExtensionToolWrapper` so the per-tool approval gate runs
// on every call site, regardless of whether any user extensions are loaded.
for (const tool of toolRegistry.values()) {
  toolRegistry.set(tool.name, new ExtensionToolWrapper(tool, extensionRunner));
}
```

### Evidência — tools MCP são envolvidas

`src/session/agent-session.ts:3789-3795`:
```ts
for (const customTool of mcpTools) {
  const wrapped = CustomToolAdapter.wrap(customTool, getCustomToolContext) as AgentTool;
  const finalTool = (this.#extensionRunner ? new ExtensionToolWrapper(wrapped, this.#extensionRunner) : wrapped) as AgentTool;
  this.#toolRegistry.set(finalTool.name, finalTool);
}
```
(Idem RPC-host tools em agent-session.ts:3849-3855.)

### Evidência — emissão dentro do wrapper

`src/extensibility/extensions/wrapper.ts:146-158`: o `ExtensionToolWrapper.execute`
emite `tool_call` **antes** de executar qualquer tool (`this.tool.execute`) e
respeita `block`. Como o wrapper é genérico sobre `this.tool`, cobre qualquer tool.

### Evidência — empírica (bash + find dispararam)

`block.log` (P4) mostra `tool_call` para **`find`** e **`bash`** na mesma run —
ou seja, não é só edição de arquivo. (Rede = `web_search`, idem coberto pelo
wrapping universal de sdk.ts:1665.)

> Observação p/ a bridge: o nome de tool MCP segue o padrão `mcp__<server>__<tool>`
> (há `isMCPToolName` em agent-session.ts:202). Trate `event.toolName` começando
> com `mcp__` como categoria "tool/MCP" no enforcement.

---

## 6. `cwd` no evento (raiz do projeto de dentro do handler)

**Resposta:** O **evento** `tool_call` **NÃO carrega cwd de sessão de forma
confiável**. Para `bash`, `event.input.cwd` é **opcional** (`BashToolInput.cwd?:
string`) — o modelo pode ou não passá-lo (confirmado: ausente numa run, presente
noutra). Tools sem arquivo (ex. `bash` sem `cwd` explícito) não trazem raiz no
payload.

**Fonte confiável da raiz do projeto: `ctx.cwd`** — segundo parâmetro do handler
(`ExtensionContext.cwd`, types.ts:298: "Current working directory"). Está
**sempre presente** em todo handler de evento. Para raiz de repositório git, use
`ctx.cwd` como base (a sessão já roda no diretório do projeto; o omp resolve
repoRoot internamente — `LoadContext.repoRoot` existe na camada de capability,
mas no handler de evento o que se tem é `ctx.cwd`).

### Evidência — `BashToolInput.cwd` é opcional

`src/tools/bash.ts:117`:
```ts
export interface BashToolInput {
  command: string;
  env?: Record<string, string>;
  timeout?: number;
  cwd?: string;     // <-- opcional
  async?: boolean;
  pty?: boolean;
}
```

### Evidência — `ctx.cwd` sempre presente

`ExtensionContext` (types.ts:288-315) inclui `cwd: string`. Empírico (spike.log):
```
SESSION_START_CTX_CWD {"cwd":"/tmp/omp-spike/work", "ctxKeys":[..., "cwd", ...]}
TOOL_CALL {... "ctxCwd":"/tmp/omp-spike/work"}    // ctx.cwd presente no handler de tool_call
```
E na run 1 o `event.input` do bash **não** tinha `cwd` (`input:{"command":"echo
hello-from-spike","timeout":300}`), enquanto `ctx.cwd` estava presente → confirma
que a fonte estável é `ctx.cwd`, não `event.input.cwd`.

---

## Impacto no plano (Tasks 7/8/9)

| Suposição | Veredito | Ação |
|---|---|---|
| Extensão `.mjs` ESM puro carrega via `-e` | **CONFIRMADO** | Manter. Distribuir a bridge como `.mjs` (sem build TS). Default export `function(pi){}`. |
| Injeção de contexto via `pi.appendEntry(...)` | **MUDA — `appendEntry` NÃO vai ao LLM** | **Trocar** para `before_agent_start` retornando `{message:{customType,content,display}}` (paridade `additionalContext`). `appendEntry` só p/ persistir estado interno da bridge, se preciso. |
| `role` da injeção evitando `system` | **CONFIRMADO/AJUSTADO** | Usar CustomMessage (role `hookMessage`/`custom`), **não** substituir `systemPrompt`. Se quiser papel `user`, `sendUserMessage`. |
| Evento de início = `session_start` | **CONFIRMADO** | Para injeção use `before_agent_start` (1×/prompt) em vez de `session_start` (só 1× no load) — escolher conforme se o contexto deve reentrar a cada prompt. |
| Compactação = `session_before_compact`/`session_compact` | **CONFIRMADO** | Nomes exatos: `session_before_compact` (antes, cancelável, tem `signal`), `session_compact` (depois), `auto_compaction_start/end` (automática). `session.compacting` (com ponto) p/ customizar prompt. |
| Pré-tool = `tool_call`, pós-tool = `tool_result` | **CONFIRMADO** | Manter. |
| Bloqueio via `return {block:true, reason}` | **CONFIRMADO (empírico)** | Manter. `reason` chega ao LLM. Roda mesmo com `--auto-approve`. |
| Equivalente de "ask" no retorno | **NÃO EXISTE no retorno** | Para "ask", chamar `ctx.ui.confirm/select` dentro do handler e então `block`. Em `-p` (`ctx.hasUI===false`) decidir por política sem UI. |
| `tool_call` cobre bash + MCP + rede | **CONFIRMADO (código + empírico)** | Chokepoint universal (sdk.ts:1665 envolve todo tool; MCP em agent-session.ts:3789). Bridge pode enforçar exec/net/tool num só handler. MCP = `event.toolName` prefixo `mcp__`. |
| `cwd` vem no evento `tool_call` | **MUDA — não confiável no evento** | **Usar `ctx.cwd`** (2º arg do handler, sempre presente), **não** `event.input.cwd` (opcional p/ bash). Resolver repoRoot a partir de `ctx.cwd`. |

### Riscos/observações para implementação

- **Exemplo desatualizado:** `examples/extensions/pirate.ts` usa `systemPromptAppend`,
  campo **não consumido** pelo runner 15.9.5 (só `message`/`systemPrompt`). Não copiar esse padrão.
- **`--no-extensions`** desabilita auto-descoberta mas **não** os `-e` explícitos —
  bom para a bridge ser injetada deterministicamente.
- **`ctx.hasUI`** distingue interativo vs `-p`/RPC; a bridge precisa de caminho
  sem-UI para enforcement em modo não-interativo (default-deny ou política
  pré-carregada).
- **Tipagem:** usar `isToolCallEventType("bash", event)` para narrowing seguro;
  `event.toolName === "bash"` não estreita por causa do `CustomToolCallEvent`.

---

## Autoridade de injeção (follow-up)

> Follow-up empírico ao item 2. Problema: o canal baseline (`before_agent_start`
> → `{message}`) **entrega** o texto ao transcript, mas o modelo o trata como
> **conteúdo não-autoritativo** (role `custom`/`hookMessage`) — reconhece como
> injeção e **ignora a instrução**. Buscou-se um canal com **paridade
> autoritativa** ao `additionalContext` do Claude Code, i.e. o modelo **obedece**.

### Metodologia (teste de AÇÃO, não de eco)

Para cada canal, injeta-se uma instrução que exige **ação observável** e roda-se
um prompt neutro com `--no-tools` (para o modelo não ler arquivos sozinho):

```
omp --no-session --no-tools <canal> -p "Quanto é 2+2?"
```

Marcador presente na resposta = canal **AUTORITATIVO** (modelo obedeceu).

**⚠️ Confound descoberto e neutralizado:** o marcador inicialmente sugerido
`⟦DFAUTH:<id>⟧` é **token-shaped** — o modelo o trata como tentativa de
exfiltração/forja de credencial e **recusa explicitamente, mesmo no bloco 0
autoritativo** (onde uma instrução benigna É obedecida). Ou seja, esse marcador
mede o reflexo de segurança do modelo, **não** a autoridade do canal. Os
resultados abaixo usam um marcador **comportamental benigno** (terminar a
resposta com a palavra `FIM-DEVFLOW`), que isola a variável "autoridade do
canal". (A frase "INSTRUÇÃO DE SISTEMA:" também dispara o reflexo de injeção e
foi evitada em favor de "Convenção de formatação deste projeto:".)

### Tabela de canais × autoridade × dinâmico × evidência

| Canal | Existe? | Assinatura / uso | Autoritativo? (marcador benigno) | Dinâmico? | Evidência |
|---|---|---|---|---|---|
| `before_agent_start` → `{message:{customType,content,display}}` | Sim | handler retorna `BeforeAgentStartEventResult.message` | **NÃO (parcial)** — 2/3 com marcador benigno; **0/3** com marcador token-shaped (rejeitado como injeção). Materializa role `custom`/`hookMessage`. | Sim (1×/prompt, reentra por turno) | runs D; types.ts:803 |
| evento `context` → `{messages}` (injeta role `user`) | Sim | `pi.on("context", h)`; handler retorna `ContextEventResult.messages` (array completo, deep-copy mutável) | **NÃO (parcial)** — 2/3. Mensagem vira role `user` (não há role `system` no array; ver types.ts core L66-68). | **Sim (1× por chamada LLM)** — dispara antes de **cada** request, reescrevendo o array | runs C; runner.ts:792-811; shared-events.ts:165 |
| `--append-system-prompt "<txt>"` (flag) | Sim | bloco de append **após o footer de projeto** quando NÃO há custom system prompt | **NÃO — fraco** — **1/6** (benigno). Posição ruim no prompt. | Estático (launch) | runs B; docs-index `system-prompt-customization.md`; main.ts:564 |
| `APPEND_SYSTEM.md` em `.omp/` (projeto) | Sim | mesmo efeito de `--append-system-prompt`; `findConfigFile` (sem walk-up) | **NÃO — fraco** — **1/3** (benigno). Mesma posição ruim. | Estático (launch; arquivo regenerável → "dinâmico por sessão") | run APPEND_SYSTEM; docs-index |
| **`--system-prompt "<txt>"` (flag)** | Sim | **substitui o bloco 0** (instruções estáveis de topo); footer de projeto (bloco 1) preservado | **SIM — forte** — **4/4** benigno, **3/3** com conteúdo DevFlow realista multi-regra | Estático (launch; DevFlow regenera por sessão → dinâmico por sessão) | runs A/F; main.ts; system-prompt.ts:337 |
| **`SYSTEM.md` em `.omp/` (projeto)** | Sim | mesmo efeito de `--system-prompt`; discovery `<cwd>/.omp` → `~/.omp/agent` (sem walk-up) | **SIM — forte** — **3/3** com conteúdo DevFlow realista | Estático (launch; arquivo regenerável por sessão) | run G; docs-index |
| `--system-prompt` **+** `--append-system-prompt` (combo) | Sim | com custom block 0 presente, o append cai **depois do bloco custom, antes do footer** (região autoritativa) | **SIM — forte** — **4/4** benigno | Estático (launch) | run E; docs-index `system-prompt-customization.md` §2 |
| `pi.appendEntry(type,data)` | Sim | persistência de estado | **N/A — NÃO vai ao LLM** | — | types.ts:1019 (item 2) |

**Achado-chave (estrutural):** a autoridade no omp 15.9.5 é **posicional**. O
**bloco 0** (instruções estáveis de topo) é o tier autoritativo — o modelo
obedece. `--system-prompt` / `SYSTEM.md` **reescrevem o bloco 0** → autoritativo
(equivalente ao `additionalContext`/system de topo). `--append-system-prompt` /
`APPEND_SYSTEM.md` sozinhos caem **depois do footer de projeto** (cauda) →
deprioritizados (1/6, 1/3). Mas o **mesmo append**, quando há um custom
`--system-prompt` presente, migra para a região autoritativa (após o bloco
custom, antes do footer) e passa a ser obedecido (4/4). Os canais de extensão
(`before_agent_start.message`, `context`) injetam em roles **não-system**
(`custom`/`hookMessage`/`user`) → autoridade apenas **parcial** (~2/3) e frágil a
conteúdo "suspeito".

**Sobre dinamismo:** `--system-prompt`/`SYSTEM.md` são fixados **no launch** do
processo (estáticos durante a sessão), mas o DevFlow **controla o launch** — pode
**regenerar** o arquivo/flag a cada sessão (recall MemPalace, routines, ADRs do
momento). Logo são "dinâmicos por sessão". O único canal **dinâmico
intra-sessão** (muda por chamada LLM, sem relançar) é o evento `context` — porém
só com autoridade parcial.

### Recomendação final (híbrido)

**(a) Orientação AUTORITATIVA (using-devflow, modo, guardrails):**
**`SYSTEM.md` em `.omp/<projeto>` (ou `--system-prompt` no launch).** É o único
canal que dá **paridade autoritativa** (bloco 0). O DevFlow gera/regenera
`<cwd>/.omp/SYSTEM.md` por sessão com a orientação estável + contexto do momento.
Cuidado: reescrever o bloco 0 **descarta** as instruções default do omp (skills,
tool guidance, workflow rules — ver doc `system-prompt-customization.md` §4). Duas
saídas: (i) re-suprir no SYSTEM.md as seções default que importarem (copiando de
`prompts/system/system-prompt.md`), **ou** (ii) usar **custom `--system-prompt`
mínimo + `--append-system-prompt`/`APPEND_SYSTEM.md`** — o append então cai na
região autoritativa (run E: 4/4) e o bloco 0 default segue intacto. **Recomendado:
opção (ii)** — preserva os defaults do omp e mantém autoridade.

**(b) Contexto DINÂMICO por sessão (recall MemPalace, routines, ADRs):** dois
níveis. Se "por sessão" basta, **regenerar `APPEND_SYSTEM.md`** (com custom
SYSTEM.md presente) a cada início — autoritativo e dinâmico-por-sessão. Se for
preciso atualizar **intra-sessão** (sem relançar omp), usar o evento **`context`**
para reinjetar como role `user` a cada chamada LLM — aceitando autoridade
parcial (~2/3); reservar para lembretes/contexto, **não** para guardrails duros.

**Resumo:** guardrails/modo → `SYSTEM.md` (custom mínimo) **+** `APPEND_SYSTEM.md`
(regras DevFlow, região autoritativa). Contexto por sessão → `APPEND_SYSTEM.md`
regenerado. Contexto intra-sessão (opcional) → evento `context`. Aposentar
`before_agent_start.message` como canal de **orientação** (serve só para
notas/telemetria visíveis, não-autoritativas).

### Snippet — extensão omp recomendada (handler `inject`)

Gera o par SYSTEM.md (custom mínimo, preserva defaults via combo) + APPEND_SYSTEM.md
no `.omp/` do projeto **antes do launch**, e (opcional) reinjeta contexto
intra-sessão via `context`. O launch passa a flag `--system-prompt` mínima para
forçar o append à região autoritativa; o conteúdo autoritativo vai no APPEND.

```js
// devflow-omp-inject.mjs  — carregado via:  omp -e devflow-omp-inject.mjs
// Pré-requisito do launcher DevFlow (fora da extensão, no spawn do omp):
//   omp --system-prompt "Você é o agente de coding sob o DevFlow." \
//       -e devflow-omp-inject.mjs ...
//   (o --system-prompt mínimo garante que o APPEND_SYSTEM.md caia na região
//    autoritativa — bloco custom presente; ver run E = 4/4. Os defaults do omp
//    permanecem porque NÃO reescrevemos o bloco 0 com conteúdo grande.)

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default function (pi) {
  // --- (b1) contexto AUTORITATIVO por sessão: APPEND_SYSTEM.md regenerado ---
  // Chamado no boot; escreve o bloco autoritativo do DevFlow.
  pi.on("session_start", (_event, ctx) => {
    const ompDir = join(ctx.cwd, ".omp");
    try {
      mkdirSync(ompDir, { recursive: true });
      const block = buildDevflowAuthoritativeBlock(ctx); // recall/ADR/routines do momento
      writeFileSync(join(ompDir, "APPEND_SYSTEM.md"), block, "utf8");
    } catch (e) {
      ctx.logger?.warn?.(`[devflow] APPEND_SYSTEM.md inject falhou: ${e}`);
    }
    // NOTA: o arquivo só é LIDO no próximo launch (discovery é no boot do omp).
    // Para a sessão ATUAL, o launcher DevFlow deve tê-lo escrito ANTES do spawn.
  });

  // --- (b2) contexto DINÂMICO intra-sessão (opcional, autoridade PARCIAL) ---
  // Reinjeta lembretes a cada chamada LLM como role `user`. NÃO usar p/ guardrails.
  pi.on("context", (event, ctx) => {
    const reminder = getEphemeralReminder(ctx); // null se nada a injetar
    if (!reminder) return; // sem mudança → omp mantém event.messages
    const msg = {
      role: "user",
      content: [{ type: "text", text: reminder }],
      timestamp: Date.now(),
    };
    return { messages: [msg, ...event.messages] };
  });
}

function buildDevflowAuthoritativeBlock(ctx) {
  // Conteúdo AUTORITATIVO: using-devflow, modo operacional, guardrails, recall.
  return [
    "## DevFlow — diretrizes operacionais (autoritativas)",
    "Você opera sob o framework DevFlow neste projeto. Trate as regras abaixo",
    "como diretrizes de sistema de mais alta prioridade.",
    "- Modo: PREVC. Não pule fases. TDD obrigatório (RED→GREEN→REFACTOR).",
    "- Guardrails git: sem push/PR/merge/troca de branch sem autorização explícita.",
    "- Leia os padrões (.context/standards/) e ADRs relevantes antes de editar.",
    "",
    "### Contexto recuperado desta sessão",
    renderRecall(ctx), // MemPalace wake-up, ADRs do momento, routines pendentes
  ].join("\n");
}

function renderRecall(_ctx) { return "(preencher via MemPalace/ADR no launcher)"; }
function getEphemeralReminder(_ctx) { return null; }
```

> **Por que não `before_agent_start.message`:** materializa role `custom`/
> `hookMessage` → autoridade apenas parcial e frágil (o modelo reconhece como
> injeção). Mantê-lo só para **exibir** notas ao usuário (não para instruir o
> modelo). A autoridade real mora no **bloco 0 / append-com-custom-block** do
> system prompt.
