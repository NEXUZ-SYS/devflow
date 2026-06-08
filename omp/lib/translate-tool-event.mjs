// omp/lib/translate-tool-event.mjs
// Evento de ferramenta do omp → shape de evento Claude Code (stdin dos hooks).
// Retorna null quando NÃO é edição de arquivo OU o file_path é inválido (M1).
// cwd: prioriza o do evento (event.cwd/workspaceRoot) sobre ctx.cwd.

const EDIT_TOOLS = new Map([["edit", "Edit"], ["write", "Write"], ["ast_edit", "Edit"]]);
const CONTROL_RE = /[\x00-\x1F]/; // controle C0 (newline, NUL, etc.)

/**
 * @param {{toolName:string, input?:Record<string,unknown>, cwd?:string, workspaceRoot?:string}} e
 * @param {{cwd:string}} ctx
 * @returns {{tool_name:string, tool_input:{file_path:string}, cwd:string} | null}
 */
export function translateToolEvent(e, ctx) {
  const tool = EDIT_TOOLS.get(e?.toolName);
  if (!tool) return null;
  const input = e.input ?? {};
  const raw = input.path ?? input.file_path ?? input.filePath ?? null;
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (CONTROL_RE.test(raw)) return null;          // M1: rejeita controle/newline/NUL
  if (!raw.startsWith("/")) return null;          // M1: exige caminho absoluto
  if (raw.split("/").includes("..")) return null; // V: rejeita traversal não normalizado
  const cwd = e.cwd ?? e.workspaceRoot ?? ctx.cwd; // prefere o do evento
  return { tool_name: tool, tool_input: { file_path: raw }, cwd };
}
