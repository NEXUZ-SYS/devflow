import { test } from "node:test";
import assert from "node:assert/strict";
import { translateToolEvent } from "../../omp/lib/translate-tool-event.mjs";

test("edit → Edit + file_path; cwd do evento tem prioridade", () => {
  const out = translateToolEvent({ toolName: "edit", input: { path: "/p/a.ts" }, cwd: "/proj" }, { cwd: "/fallback" });
  assert.deepEqual(out, { tool_name: "Edit", tool_input: { file_path: "/p/a.ts" }, cwd: "/proj" });
});
test("sem cwd no evento → usa ctx.cwd", () => {
  const out = translateToolEvent({ toolName: "write", input: { path: "/p/b.ts" } }, { cwd: "/fallback" });
  assert.equal(out.cwd, "/fallback");
});
test("ast_edit → Edit (cobertura extra)", () => {
  assert.equal(translateToolEvent({ toolName: "ast_edit", input: { path: "/p/c.ts" } }, { cwd: "/p" }).tool_name, "Edit");
});
test("ferramenta não-edição → null", () => {
  assert.equal(translateToolEvent({ toolName: "bash", input: {} }, { cwd: "/p" }), null);
});
test("file_path com caractere de controle → null (M1: newline + NUL)", () => {
  assert.equal(translateToolEvent({ toolName: "edit", input: { path: "/p/a\nb.ts" } }, { cwd: "/p" }), null);
  assert.equal(translateToolEvent({ toolName: "edit", input: { path: "/p/a" + String.fromCharCode(0) + "b.ts" } }, { cwd: "/p" }), null);
});
test("path não-absoluto → null (M1)", () => {
  assert.equal(translateToolEvent({ toolName: "edit", input: { path: "../etc/passwd" } }, { cwd: "/p" }), null);
});
test("aliases de path (file_path/filePath/workspaceRoot)", () => {
  assert.equal(translateToolEvent({ toolName: "edit", input: { file_path: "/p/d.ts" }, workspaceRoot: "/w" }, { cwd: "/f" }).cwd, "/w");
});
