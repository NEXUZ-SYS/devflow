// tests/skills/test-adr-path-v2.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VAL = readFileSync("skills/prevc-validation/SKILL.md", "utf-8");
const CA = readFileSync("skills/context-awareness/SKILL.md", "utf-8");

test("prevc-validation resolve ADRs pelo caminho canônico v2", () => {
  assert.match(VAL, /\.context\/engineering\/adrs\/README\.md/);
  assert.match(VAL, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/lib\/context-paths\.mjs" resolve-read adrs "\$PWD"/);
});

test("prevc-validation não condiciona a checagem só ao caminho legado", () => {
  assert.doesNotMatch(VAL, /Only if `\.context\/adrs\/README\.md` exists \(canonical since v1\.0\)/);
});

test("context-awareness aponta para o caminho canônico v2", () => {
  assert.match(CA, /\.context\/engineering\/adrs\//);
});

test("o comando citado na skill funciona num projeto v2", () => {
  const root = mkdtempSync(join(tmpdir(), "adr-v2-"));
  mkdirSync(join(root, ".context/engineering/adrs"), { recursive: true });
  writeFileSync(join(root, ".context/engineering/adrs/README.md"), "# ADRs\n");
  const cmd = VAL.match(/node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/lib\/context-paths\.mjs" resolve-read adrs "\$PWD"/)[0];
  const r = spawnSync("bash", ["-c", cmd], { cwd: root, encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd() } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout.split("\n")[0], /\.context\/engineering\/adrs$/);
});
