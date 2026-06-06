// omp/lib/parse-hook-output.mjs
// Parseia o stdout de um hook DevFlow (protocolo Claude Code).
// IMPORTANTE: stdout pode ser MISTO — bloco <KNOWLEDGE_ONDEMAND> cru ANTES do
// envelope JSON. Extraímos o último objeto JSON parseável e tratamos o texto
// que o antecede como contexto (knowledge on-demand).
function extractEnvelope(text) {
  for (let i = text.indexOf("{"); i >= 0; i = text.indexOf("{", i + 1)) {
    try { return { obj: JSON.parse(text.slice(i)), leading: text.slice(0, i).trim() }; } catch { /* tenta o próximo */ }
  }
  return { obj: null, leading: text };
}
/** @param {string} stdout @returns {{contextToInject:string|null, block:boolean, reason:string|null}} */
export function parseHookOutput(stdout) {
  const text = (stdout ?? "").trim();
  if (!text) return { contextToInject: null, block: false, reason: null };
  const { obj, leading } = extractEnvelope(text);
  if (!obj) return { contextToInject: leading || null, block: false, reason: null };
  const hso = obj.hookSpecificOutput ?? obj;
  const decision = hso.permissionDecision;
  if (decision === "deny" || decision === "ask") {
    return { contextToInject: null, block: true, reason: hso.permissionDecisionReason ?? "bloqueado pelo hook" };
  }
  const fromJson = hso.additionalContext ?? hso.additional_context ?? obj.additionalContext ?? obj.additional_context ?? null;
  const ctx = [leading || null, fromJson].filter(Boolean).join("\n") || null;
  return { contextToInject: ctx, block: false, reason: null };
}
