// omp/lib/permissions-bridge.mjs
// Mapeia evento omp → shape PLANO que evaluatePermissions entende:
// { tool, path?, command?, url? } — espelhando hooks/pre-tool-use:67-72.
// Cobre TODAS as categorias (fs/exec/net/tool). Node puro.
import { loadPermissions, evaluatePermissions } from "../../scripts/lib/permissions-evaluator.mjs";
const FS_WRITE = new Set(["edit", "write", "ast_edit"]);
const NET = new Set(["web_search", "browser"]);
/** @param {{toolName?:string, input?:Record<string,unknown>}} e @returns {{tool:string, path?:string, command?:string, url?:string}} */
export function ompEventToPermEvent(e) {
  const t = e?.toolName ?? "";
  const i = e?.input ?? {};
  const path = i.path ?? i.file_path ?? i.filePath ?? "";
  if (t === "bash") return { tool: "Bash", command: String(i.command ?? "") };
  if (FS_WRITE.has(t)) return { tool: "Write", path };
  if (t === "read") return { tool: "Read", path };
  if (NET.has(t)) return { tool: t, url: String(i.url ?? "") };
  if (t.startsWith("mcp__")) return { tool: t };
  return { tool: t };
}
/** @returns {Promise<{decision:string, reason?:string}>} */
export async function checkPermission(ompEvent, projectRoot) {
  const cfg = loadPermissions(projectRoot);
  return evaluatePermissions(ompEventToPermEvent(ompEvent), cfg);
}
