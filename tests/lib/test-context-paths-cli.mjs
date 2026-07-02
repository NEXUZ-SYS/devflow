// tests/lib/test-context-paths-cli.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

const CLI = new URL("../../scripts/lib/context-paths.mjs", import.meta.url).pathname;
const run = (args, cwd) => execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8" }).trim();

// canônico v2: engineering/adrs presente → deve ser a 1ª linha
const root = mkdtempSync(join(tmpdir(), "cp-"));
mkdirSync(join(root, ".context", "engineering", "adrs"), { recursive: true });
const out = run(["resolve-read", "adrs", root], root);
assert.strictEqual(out.split("\n")[0], join(root, ".context", "engineering", "adrs"),
  "engineering/adrs deve ser o path de leitura canônico (1ª linha)");

// legado co-habitando: engineering + legado ambos existem → ambos listados, canonical 1º
mkdirSync(join(root, ".context", "adrs"), { recursive: true });
const out2 = run(["resolve-read", "adrs", root], root).split("\n");
assert.ok(out2.includes(join(root, ".context", "adrs")), "legado existente deve ser incluído");
assert.strictEqual(out2[0], join(root, ".context", "engineering", "adrs"), "canonical continua 1º");

console.log("OK test-context-paths-cli");
