// scripts/lib/agent-route-hook.mjs — fallback CLÁSSICO do roteamento de subagentes (spec D4/D15).
// Sai com um único JSON ou nada; nunca nega; nunca emite permissionDecision; erro → nada.
// Toda leitura de arquivo é sem seguir symlink e sem bloquear (segurança 1).
import { readFileSync, openSync, readSync, fstatSync, closeSync, constants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readModels } from "./models-config.mjs";
import { resolveSubagentRoute, effectiveConfig, phaseFromPrevcJson, functionHooksOn } from "./model-routing.mjs";
import { readInRoot } from "./safe-read.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAIL = 256 * 1024;

// Cauda de um arquivo REGULAR, sem seguir link e sem bloquear em FIFO.
function safeTail(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile()) return "";
    const len = Math.min(st.size, TAIL);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, st.size - len);
    return buf.toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* já fechado */ }
  }
}

export function sessionModelFromTranscript(path) {
  if (typeof path !== "string" || !path) return null;
  let last = null;
  for (const line of safeTail(path).split("\n")) {
    try {
      const o = JSON.parse(line);
      if (o?.type === "assistant" && typeof o.message?.model === "string" && o.message.model.startsWith("claude")) last = o.message.model;
    } catch { /* linha cortada na borda da cauda */ }
  }
  return last;
}

export function decide(input, env = process.env) {
  if (functionHooksOn(env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS)) return null; // o mod decide (exclusão mútua)
  const ti = input?.tool_input;
  if (!ti || typeof ti !== "object" || typeof input.cwd !== "string") return null;
  const src = readInRoot(input.cwd, ".context/.devflow.yaml");
  if (src === null) return null;
  const config = effectiveConfig(readModels(src), env.DEVFLOW_MODEL_ROUTING);
  if (!config.enabled) return null;
  const table = JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf8"));
  const phase = phaseFromPrevcJson(readInRoot(input.cwd, ".context/runtime/workflows/prevc.json") ?? "");
  const route = resolveSubagentRoute({
    table, config, agentType: ti.subagent_type, phase,
    skill: null, taskTier: null, explicitModel: ti.model ?? null,
    ceilingModel: sessionModelFromTranscript(input.transcript_path), ceilingEffort: null,
  });
  if (!route?.model || route.model === ti.model) return null;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { ...ti, model: route.model } } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const out = decide(JSON.parse(readFileSync(0, "utf8")));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch { /* silêncio: comportamento de hoje */ }
  process.exit(0);
}
