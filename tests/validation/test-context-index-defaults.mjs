#!/usr/bin/env node
// tests/validation/test-context-index-defaults.mjs
// TDD (RED-first): verifies that plugin-bundled default standards appear in
// the context index tagged with origin=default / "[default]" marker.
//
// Fixture: tmp project with ZERO project standards + tmp plugin dir that has
// assets/standards/std-security.md.  Calls buildContextIndex via the CLI
// (context-index-cli.mjs --plugin=<dir>) and asserts std-security surfaces
// as a default.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildContextIndex } from "../../scripts/lib/context-index.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const CLI = new URL(
  "../../scripts/lib/context-index-cli.mjs",
  import.meta.url,
).pathname;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(prefix = "ctxidx-defaults-") {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const dir = mkdtempSync(join(TEST_TMP_ROOT, prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Write a minimal valid standard .md to <baseDir>/std-<slug>.md.
 * baseDir must already exist.
 *
 * NOTE: for project standards, baseDir must be the canonical
 * .context/engineering/standards/ path (DDC layout v2).
 */
function writeStd(baseDir, slug, extra = {}) {
  const fm = {
    id: `std-${slug}`,
    description: `${slug} conventions`,
    version: "1.0.0",
    applyTo: ["**/*.ts"],
    ...extra,
  };
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map(x => `"${x}"`).join(", ")}]`);
    } else {
      lines.push(`${k}: ${typeof v === "string" ? `"${v}"` : v}`);
    }
  }
  lines.push("---", "", `# Standard ${slug}\n## Princípios\n- foo\n`);
  writeFileSync(join(baseDir, `std-${slug}.md`), lines.join("\n"));
}

/** Create a plugin dir with assets/standards/std-security.md. */
function makePluginDir(prefix = "plugin-") {
  const { dir: pluginRoot, cleanup } = makeTmpDir(prefix);
  const stdDir = join(pluginRoot, "assets", "standards");
  mkdirSync(stdDir, { recursive: true });
  writeStd(stdDir, "security");
  return { pluginRoot, cleanup };
}

/** Create a bare project dir (no .context at all). */
function makeEmptyProject(prefix = "project-") {
  const { dir: projectRoot, cleanup } = makeTmpDir(prefix);
  return { projectRoot, cleanup };
}

// ─── Unit-level tests (buildContextIndex with pluginRoot arg) ─────────────────

test("buildContextIndex with pluginRoot: default std appears when project has zero standards", () => {
  const proj = makeEmptyProject();
  const plug = makePluginDir();
  try {
    // Must accept pluginRoot as second argument
    const idx = buildContextIndex(proj.projectRoot, plug.pluginRoot);
    assert.ok(idx.standards.length >= 1, "expected at least 1 standard from defaults");
    const sec = idx.standards.find(s => s.id === "std-security");
    assert.ok(sec, "std-security from plugin defaults must appear in index");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

test("buildContextIndex with pluginRoot: default standard is tagged with origin='default'", () => {
  const proj = makeEmptyProject();
  const plug = makePluginDir();
  try {
    const idx = buildContextIndex(proj.projectRoot, plug.pluginRoot);
    const sec = idx.standards.find(s => s.id === "std-security");
    assert.ok(sec, "std-security must be present");
    // The index item must expose origin so the renderer can tag it [default]
    assert.equal(sec.origin, "default", "default standard must carry origin='default'");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

test("buildContextIndex: project standard overrides default with same id, origin=project", () => {
  const proj = makeEmptyProject();
  const plug = makePluginDir();
  try {
    // Add a project-level std-security that overrides the default.
    // Must use the DDC canonical path: .context/engineering/standards/
    const projStdDir = join(proj.projectRoot, ".context", "engineering", "standards");
    mkdirSync(projStdDir, { recursive: true });
    writeStd(projStdDir, "security", { description: "project override" });

    const idx = buildContextIndex(proj.projectRoot, plug.pluginRoot);
    const sec = idx.standards.find(s => s.id === "std-security");
    assert.ok(sec, "std-security must be present");
    assert.equal(sec.origin, "project", "project standard must override default");
    // Exactly one entry — no duplicates
    const all = idx.standards.filter(s => s.id === "std-security");
    assert.equal(all.length, 1, "only one entry per id");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

test("buildContextIndex: no pluginRoot = only project standards, no defaults", () => {
  const proj = makeEmptyProject();
  try {
    // Write a project-level standard — canonical DDC path
    const projStdDir = join(proj.projectRoot, ".context", "engineering", "standards");
    mkdirSync(projStdDir, { recursive: true });
    writeStd(projStdDir, "typescript");

    const idx = buildContextIndex(proj.projectRoot, undefined);
    assert.equal(idx.standards.length, 1);
    assert.equal(idx.standards[0].id, "std-typescript");
    // No phantom default std-security
    assert.ok(
      !idx.standards.find(s => s.id === "std-security"),
      "should not have security default without pluginRoot",
    );
  } finally {
    proj.cleanup();
  }
});

// ─── Renderer: [default] tag surfaced in text output ─────────────────────────

test("renderContextIndexText: default standard is marked [default] in text", async () => {
  const { renderContextIndexText } = await import(
    "../../scripts/lib/context-index.mjs"
  );
  const proj = makeEmptyProject();
  const plug = makePluginDir();
  try {
    const idx = buildContextIndex(proj.projectRoot, plug.pluginRoot);
    const text = renderContextIndexText(idx);
    assert.match(
      text,
      /\[default\].*std-security|std-security.*\[default\]/,
      "text output must mark default standards with [default]",
    );
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

// ─── CLI: --plugin flag ────────────────────────────────────────────────────────

test("CLI --plugin: passes pluginRoot, default std appears in JSON output", () => {
  const proj = makeEmptyProject();
  const plug = makePluginDir();
  try {
    const r = spawnSync(
      "node",
      [CLI, `--project=${proj.projectRoot}`, `--plugin=${plug.pluginRoot}`],
      { encoding: "utf-8" },
    );
    assert.equal(r.status, 0, `exit=${r.status}; stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    const sec = out.standards.find(s => s.id === "std-security");
    assert.ok(sec, "std-security must appear in CLI JSON output");
    assert.equal(sec.origin, "default");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

test("CLI --plugin: text output marks default with [default]", () => {
  const proj = makeEmptyProject();
  const plug = makePluginDir();
  try {
    const r = spawnSync(
      "node",
      [
        CLI,
        `--project=${proj.projectRoot}`,
        `--plugin=${plug.pluginRoot}`,
        "--format=text",
      ],
      { encoding: "utf-8" },
    );
    assert.equal(r.status, 0, `exit=${r.status}; stderr: ${r.stderr}`);
    assert.match(
      r.stdout,
      /\[default\].*std-security|std-security.*\[default\]/,
      "text output must mark default with [default]",
    );
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

test("CLI env CLAUDE_PLUGIN_ROOT fallback: default std appears without --plugin", () => {
  const proj = makeEmptyProject();
  const plug = makePluginDir();
  try {
    const r = spawnSync("node", [CLI, `--project=${proj.projectRoot}`], {
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: plug.pluginRoot },
    });
    assert.equal(r.status, 0, `exit=${r.status}; stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    const sec = out.standards.find(s => s.id === "std-security");
    assert.ok(sec, "env CLAUDE_PLUGIN_ROOT must work as fallback");
    assert.equal(sec.origin, "default");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});
