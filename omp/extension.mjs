// omp/extension.mjs — extensão DevFlow para o omp (oh-my-pi).
//
// RESPONSABILIDADE (revisada na Task 7):
//   - A injeção AUTORITATIVA do contexto de sessão (using-devflow, modo,
//     guardrails, índice de standards, recall, napkin, routines) é feita pelo
//     LAUNCHER (scripts/omp-launch.mjs) via --system-prompt + --append-system-prompt
//     (bloco 0 autoritativo). NÃO é mais feita aqui via `before_agent_start`,
//     pois esse canal materializa role `custom`/`hookMessage` → autoridade só
//     parcial e frágil (o modelo reconhece como injeção). Ver
//     omp/SPIKE-omp-api.md, seção "Autoridade de injeção (follow-up)".
//
//   - Esta extensão cuida do contexto DINÂMICO INTRA-SESSÃO (sem relançar o
//     omp): uma fila `pending` é drenada no evento `context`, que dispara antes
//     de CADA chamada ao LLM. As Tasks 8/9 (compact rehydration / tool nudge)
//     vão chamar `enqueue(...)` para enfileirar knowledge/nudge/rehidratação.
//
// IMPORTANTE sobre autoridade do `context`: a mensagem injetada vira role
// `user` (não há role `system` no array de mensagens) → autoridade PARCIAL
// (~2/3 no spike). Use para LEMBRETES/contexto efêmero, NÃO para guardrails
// duros (esses moram no system prompt autoritativo via launcher).

import { runBashHook } from "./lib/run-bash-hook.mjs";
import { parseHookOutput } from "./lib/parse-hook-output.mjs";
import { translateToolEvent } from "./lib/translate-tool-event.mjs";
import { resolveProjectCwd } from "./lib/resolve-cwd.mjs";
import { checkPermission } from "./lib/permissions-bridge.mjs";

// --- Fila de contexto dinâmico intra-sessão (compartilhada com Tasks 8/9) ---
const pending = [];

/** Enfileira texto para reinjeção na próxima chamada ao LLM (via evento `context`).
 *  @param {string} text */
export function enqueue(text) {
  if (text && text.trim()) pending.push(text);
}

/** @returns {readonly string[]} snapshot da fila (para inspeção/teste) */
export function peekPending() {
  return pending.slice();
}

/** Drena a fila e devolve o conteúdo concatenado (ou null se vazia).
 *  @returns {string|null} */
function drainPending() {
  if (!pending.length) return null;
  const content = pending.join("\n\n");
  pending.length = 0;
  return content;
}

/** @param {any} pi */
export default function ext(pi) {
  // Contexto dinâmico intra-sessão: drena `pending` antes de cada chamada LLM.
  // Handler do evento `context` recebe { type:"context", messages } e retorna
  // { messages } para substituir o array enviado ao modelo. Injetamos a fila
  // como uma mensagem role `user` no início do array (autoridade parcial).
  // Sem nada na fila → retorna undefined → o omp mantém event.messages intacto.
  pi.on("context", (event) => {
    const content = drainPending();
    if (!content) return undefined;
    const msg = {
      role: "user",
      content: [{ type: "text", text: content }],
      timestamp: Date.now(),
    };
    return { messages: [msg, ...event.messages] };
  });

  // --- Compactação (Task 8): snapshot antes, rehidratação depois (via fila) ---
  pi.on("session_before_compact", (_event, ctx) => { runBashHook("pre-compact", { cwd: ctx.cwd }); });
  pi.on("session_compact", (_event, ctx) => {
    enqueue(parseHookOutput(runBashHook("post-compact", { cwd: ctx.cwd })).contextToInject);
  });

  // --- tool_call (Task 9): permissions (todas categorias) + git-guard + knowledge ---
  pi.on("tool_call", async (event, ctx) => {
    const projectCwd = ctx.cwd; // spike: evento não tem cwd
    const perm = await checkPermission(event, projectCwd);
    if (perm.decision === "deny") return { block: true, reason: perm.reason ?? "bloqueado por .context/permissions.yaml" };
    if ((perm.decision === "prompt" || perm.decision === "ask") && ctx.hasUI && ctx.ui?.confirm) {
      const ok = await ctx.ui.confirm(`DevFlow: permitir ${event.toolName}? (${perm.reason ?? "mode: prompt"})`);
      if (!ok) return { block: true, reason: "negado pelo usuário (permissions: prompt)" };
    }
    const cc = translateToolEvent(event, { cwd: projectCwd });
    if (!cc) return;
    const cwd = resolveProjectCwd(cc.tool_input.file_path, projectCwd);
    const { contextToInject, block, reason } = parseHookOutput(runBashHook("pre-tool-use", { stdin: JSON.stringify({ ...cc, cwd }), cwd }));
    if (block) return { block: true, reason };
    enqueue(contextToInject);
  });

  // --- tool_result (Task 9): linter standards + nudge + handoff guard (via fila) ---
  pi.on("tool_result", (event, ctx) => {
    const cc = translateToolEvent(event, { cwd: ctx.cwd });
    if (!cc) return;
    const cwd = resolveProjectCwd(cc.tool_input.file_path, ctx.cwd);
    enqueue(parseHookOutput(runBashHook("post-tool-use", { stdin: JSON.stringify({ ...cc, cwd }), cwd })).contextToInject);
  });
}
