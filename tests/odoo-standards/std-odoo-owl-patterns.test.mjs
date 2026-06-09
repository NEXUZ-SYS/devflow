import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-owl-patterns.js",
);

function lint(filename, content) {
  const dir = mkdtempSync(join(tmpdir(), "odoo-std-"));
  const fp = join(dir, filename);
  writeFileSync(fp, content);
  try {
    execFileSync("node", [LINTER, fp], { encoding: "utf-8" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("std-odoo-owl-patterns linter", () => {
  it("BAD: componente OWL com constructor() → flag (exit 1)", () => {
    const r = lint(
      "my_widget.js",
      `/** @odoo-module **/
import { Component } from "@odoo/owl";
class MyWidget extends Component {
    constructor() { super(...arguments); this.x = 1; }
}
`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION:/);
    assert.match(r.out, /constructor/i);
  });

  it("GOOD: componente OWL com setup() → exit 0", () => {
    const r = lint(
      "my_widget.js",
      `/** @odoo-module **/
import { Component, onWillStart } from "@odoo/owl";
class MyWidget extends Component {
    setup() { onWillStart(async () => {}); }
}
`,
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GOOD: constructor() em arquivo sem 'extends Component' → exit 0", () => {
    const r = lint(
      "my_service.js",
      `/** @odoo-module **/
export class MyService {
    constructor() { this.cache = {}; }
}
`,
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GATE: arquivo .py → exit 0 (não processa)", () => {
    const r = lint(
      "models.py",
      `class Foo:
    def __init__(self):
        pass
`,
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GATE: arquivo .xml → exit 0 (não processa)", () => {
    const r = lint(
      "template.xml",
      `<templates><t t-name="addon.Foo">extends Component constructor(</t></templates>`,
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });
});
