// e2e: o plugin real declara o contrato de $.state e passa no `claude plugin validate .`.
// O validate é pulado com aviso quando o `claude` não está instalado (mesma regra do tests/run-integration.sh).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hasClaude = spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;

test("plugin.json aponta o contrato e ele declara as chaves do monitor; hooks.json segue com um módulo", () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(plugin.types, "./types/index.d.ts");
  const types = fs.readFileSync(path.join(REPO, "types/index.d.ts"), "utf8");
  for (const k of ["routing", "monitorRows", "monitorRetries"]) assert.match(types, new RegExp(`\\b${k}:`));
  assert.doesNotMatch(types, /export\s*\{\s*\}/); // o validate recusa export que não seja de tipo
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO, "hooks/hooks.json"), "utf8"));
  assert.deepEqual(hooks.modules, ["./router.mjs"]); // o engine aceita um módulo por plugin
});

test("claude plugin validate . passa", { skip: hasClaude ? false : "claude ausente — validate NÃO rodou" }, () => {
  const r = spawnSync("claude", ["plugin", "validate", "."], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
