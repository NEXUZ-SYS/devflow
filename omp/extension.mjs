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

  // Estrutura pronta para as Tasks 8/9: elas registrarão handlers de
  // `session_before_compact`/`session_compact` (rehidratação) e `tool_call`/
  // `tool_result` (nudge), chamando enqueue(...) para reinjetar via `context`.
}
