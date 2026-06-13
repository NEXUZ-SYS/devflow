// tests/standards/taxonomy-consistency.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const STD_DIR = resolve(ROOT, "assets/standards");
const MACHINE = resolve(STD_DIR, "machine");
const MANIFEST = resolve(STD_DIR, "MANIFEST.txt");

const manifest = readFileSync(MANIFEST, "utf-8").split("\n").map(s => s.trim()).filter(Boolean);
const mdFiles = readdirSync(STD_DIR).filter(f => f.startsWith("std-") && f.endsWith(".md"));

describe("Standards: trio MANIFEST ↔ .md ↔ machine", () => {
  it("todo .md está no MANIFEST", () => {
    const missing = mdFiles.filter(f => !manifest.includes(f));
    assert.deepEqual(missing, [], `faltam no MANIFEST: ${missing.join(", ")}`);
  });

  it("todo item do MANIFEST tem .md no disco", () => {
    const missing = manifest.filter(f => !existsSync(resolve(STD_DIR, f)));
    assert.deepEqual(missing, [], `MANIFEST aponta p/ inexistentes: ${missing.join(", ")}`);
  });

  it("todo .md declara enforcement.linter (path ou null explícito)", () => {
    // Tolerante à ordem das sub-chaves: busca `linter:` em qualquer lugar do
    // arquivo (Task 12 adiciona `enforcedBy` que pode preceder `linter`).
    const bad = mdFiles.filter(f => {
      const c = readFileSync(resolve(STD_DIR, f), "utf-8");
      return !/^\s*linter:\s*(machine\/[\w-]+\.js|null)\s*$/m.test(c);
    });
    assert.deepEqual(bad, [], `sem enforcement.linter explícito: ${bad.join(", ")}`);
  });

  it("se linter:null então há enforcedBy ou weakStandardWarning (sem std órfão de enforcement)", () => {
    const bad = mdFiles.filter(f => {
      const c = readFileSync(resolve(STD_DIR, f), "utf-8");
      if (!/^\s*linter:\s*null\s*$/m.test(c)) return false;        // só os null
      return !/^\s*(enforcedBy:|weakStandardWarning:\s*true)/m.test(c);
    });
    assert.deepEqual(bad, [], `linter:null sem veículo nem aviso: ${bad.join(", ")}`);
  });

  it("todo linter referenciado existe em machine/", () => {
    const missing = [];
    for (const f of mdFiles) {
      const c = readFileSync(resolve(STD_DIR, f), "utf-8");
      const m = c.match(/^\s*linter:\s*(machine\/[\w-]+\.js)\s*$/m);
      if (m && !existsSync(resolve(STD_DIR, m[1]))) missing.push(m[1]);
    }
    assert.deepEqual(missing, [], `linter declarado mas ausente: ${missing.join(", ")}`);
  });
});
