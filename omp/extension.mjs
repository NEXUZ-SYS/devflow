// omp/extension.mjs
// Extensão omp do DevFlow — bridge fino (wrap & reuse dos hooks).
// Injeção via before_agent_start.message (confirmado no spike — appendEntry NÃO
// chega ao LLM). cwd sempre de ctx.cwd. Mensagem custom (não role:system).
import { runBashHook, missingDeps } from "./lib/run-bash-hook.mjs";
import { parseHookOutput } from "./lib/parse-hook-output.mjs";

const pending = [];
function enqueue(text) { if (text && text.trim()) pending.push(text); }
function drainMessage() {
  if (!pending.length) return undefined;
  const content = pending.join("\n\n");
  pending.length = 0;
  return { message: { customType: "devflow-context", content, display: false } };
}

/** @param {any} pi */
export default function ext(pi) {
  let started = false;
  pi.on("before_agent_start", (_event, ctx) => {
    if (!started) {
      started = true;
      const missing = missingDeps();
      if (missing.length) enqueue(`⚠️ DevFlow: dependências ausentes (${missing.join(", ")}). Hooks de standards/knowledge/git-guard podem não funcionar. Veja docs/omp-integration.md.`);
      enqueue(parseHookOutput(runBashHook("session-start", { args: ["startup"], cwd: ctx.cwd })).contextToInject);
    }
    return drainMessage();
  });
}
