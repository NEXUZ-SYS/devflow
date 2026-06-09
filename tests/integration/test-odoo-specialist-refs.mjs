/**
 * Sanity gate — the bundled odoo-specialist agent must be a clean, generic
 * plugin template: all sub-agent references resolve, and no private NXZ
 * environment data (absolute home paths, DB names, ports) leaks into the plugin.
 * Run: node --test tests/integration/test-odoo-specialist-refs.mjs
 *
 * AC1  every .context/agents/<name>.md referenced in the body has a bundled
 *      agents/<name>.md (catches the broken `architect-specialist` reference)
 * AC2  no absolute home path leaks (e.g. ~/Documentos/...)
 * AC3  no hardcoded NXZ database names leak
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const AGENT = join(REPO, "agents", "odoo-specialist.md");

describe("odoo-specialist bundled template", () => {
  const body = readFileSync(AGENT, "utf-8");

  it("AC1 every referenced .context/agents/<name>.md exists in the bundle", () => {
    const refs = [...body.matchAll(/\.context\/agents\/([a-z0-9-]+)\.md/g)]
      .map((m) => m[1]);
    const unique = [...new Set(refs)];
    assert.ok(unique.length > 0, "expected at least one sub-agent reference");
    const missing = unique.filter((name) => !existsSync(join(REPO, "agents", `${name}.md`)));
    assert.deepEqual(missing, [], `unresolved sub-agent references: ${missing.join(", ")}`);
  });

  it("AC2 no absolute home path leaks", () => {
    const leaks = [...body.matchAll(/~\/[A-Za-z][\w/.-]*/g)].map((m) => m[0]);
    assert.deepEqual(leaks, [], `home-path leaks found: ${leaks.join(", ")}`);
  });

  it("AC3 no hardcoded NXZ database names leak", () => {
    const dbLeaks = ["odoo14-migration", "odoo18-nxz"].filter((db) => body.includes(db));
    assert.deepEqual(dbLeaks, [], `DB name leaks found: ${dbLeaks.join(", ")}`);
  });
});
