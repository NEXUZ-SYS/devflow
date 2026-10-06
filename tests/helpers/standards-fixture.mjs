// tests/helpers/standards-fixture.mjs — fixtures de projeto para os testes de standards.
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Linter no formato v2: uma linha VIOLATION por ocorrência de "BAD".
export const LINT_BAD = `const fs=require("fs");const c=fs.readFileSync(process.argv[2],"utf8");let h=0;
c.split("\\n").forEach((l,i)=>{ if(l.includes("BAD")){h++;console.log("VIOLATION no-bad "+process.argv[2]+":"+(i+1)+" remova BAD");} });process.exit(h?1:0);`;

// Ids de todos os standards default do plugin (lidos de assets/standards, relativo ao cwd
// do runner, que é a raiz do repo).
export function defaultIds() {
  return readdirSync("assets/standards").filter(n => /^std-.*\.md$/.test(n))
    .map(n => (readFileSync(join("assets/standards", n), "utf8").match(/^id:\s*(\S+)/m) || [])[1]).filter(Boolean);
}

// Desliga todos os defaults do plugin no projeto, para o teste só ver os próprios stds.
export function isolateFromDefaults(root) {
  mkdirSync(join(root, ".context"), { recursive: true });
  writeFileSync(join(root, ".context/standards.local.yaml"), `disable: [${defaultIds().join(", ")}]\n`);
}

export function demoProject({ level = "block", linterBody = LINT_BAD, source = "local", isolate = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "std-"));
  const std = join(root, ".context/engineering/standards");
  mkdirSync(join(std, "machine"), { recursive: true });
  writeFileSync(join(std, "std-demo.md"),
    `---\nid: std-demo\nsource: ${source}\ndescription: demo\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/std-demo.js\n  level: ${level}\n---\n## Princípios\n- sem BAD\n`);
  writeFileSync(join(std, "machine/std-demo.js"), linterBody);
  mkdirSync(join(root, "src"), { recursive: true });
  if (isolate) isolateFromDefaults(root);
  return root;
}
