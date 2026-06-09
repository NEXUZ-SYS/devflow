/**
 * Regression gate — every project-agent reference in a bundled skill/agent must
 * resolve to a bundled fallback agent. A skill that says "Read
 * `.context/agents/<name>.md`" relies on `agents/<name>.md` existing for the
 * Minimal-mode fallback (agent-dispatch Priority 3). If the names drift (the
 * `architect` vs `architect-specialist` split), the reference dangles.
 * Run: node --test tests/integration/test-bundled-agent-refs.mjs
 *
 * AC1  every `.context/agents/<name>.md` referenced under skills/ or agents/
 *      has a bundled agents/<name>.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const REF_RE = /\.context\/agents\/([a-z0-9-]+)\.md/g;

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

describe("bundled agent references resolve", () => {
  it("AC1 every referenced .context/agents/<name>.md has a bundled agents/<name>.md", () => {
    const files = [...walk(join(REPO, "skills")), ...walk(join(REPO, "agents"))];
    const offenders = [];
    for (const f of files) {
      const body = readFileSync(f, "utf-8");
      for (const m of body.matchAll(REF_RE)) {
        const name = m[1];
        if (!existsSync(join(REPO, "agents", `${name}.md`))) {
          offenders.push(`${f.replace(REPO + "/", "")} → .context/agents/${name}.md`);
        }
      }
    }
    assert.deepEqual([...new Set(offenders)], [],
      `dangling project-agent references:\n${[...new Set(offenders)].join("\n")}`);
  });
});
