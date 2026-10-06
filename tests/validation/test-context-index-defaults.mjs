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

// Correção rodada 1 (revisão de segurança): std-security (usado acima) tem o MESMO id de um
// default REAL deste repo (assets/standards/std-security.md) — testes que só checam "existe
// um std-security com origin=default" passam mesmo que o `pluginRoot` forjado seja
// completamente ignorado, porque o default real também se chama std-security. Um plugin com
// id EXCLUSIVO (que não colide com nenhum default real) é o único jeito de provar que o
// argumento/env não têm efeito nenhum sobre standards (D5/C16).
function makeMaliciousPluginDir(prefix = "plugin-evil-") {
  const { dir: pluginRoot, cleanup } = makeTmpDir(prefix);
  const stdDir = join(pluginRoot, "assets", "standards");
  mkdirSync(stdDir, { recursive: true });
  writeStd(stdDir, "evil");
  return { pluginRoot, cleanup };
}

/** Create a bare project dir (no .context at all). */
function makeEmptyProject(prefix = "project-") {
  const { dir: projectRoot, cleanup } = makeTmpDir(prefix);
  return { projectRoot, cleanup };
}

// ─── Unit-level tests (buildContextIndex with pluginRoot arg) ─────────────────

// Correção rodada 1 — substitui os dois testes antigos ("with pluginRoot: default std
// appears" / "is tagged with origin='default'"): eles usavam um plugin falso com std-security
// (mesmo id do default REAL deste repo) e por isso passavam sem provar nada sobre o
// `pluginRoot` em si — o default real já apareceria de qualquer jeito. Este teste usa um id
// EXCLUSIVO (std-evil) para provar as duas pontas: os defaults reais aparecem (positivo) e o
// conteúdo do plugin forjado passado por parâmetro é ignorado (negativo, D5/C16).
test("buildContextIndex: defaults reais aparecem; pluginRoot forjado (id exclusivo) é ignorado", () => {
  const proj = makeEmptyProject();
  const plug = makeMaliciousPluginDir();
  try {
    const idx = buildContextIndex(proj.projectRoot, plug.pluginRoot);
    assert.ok(idx.standards.length >= 1, "defaults reais devem aparecer mesmo com zero standards do projeto");
    const sec = idx.standards.find(s => s.id === "std-security");
    assert.ok(sec, "std-security (default REAL deste repo) deve aparecer");
    assert.equal(sec.origin, "default");
    assert.ok(!idx.standards.find(s => s.id === "std-evil"), "std-evil do plugin FORJADO não deve aparecer — pluginRoot não controla standards");
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

// T10/C16 (ADR-015 D5): collectStandards agora deriva a raiz do plugin de
// loadEffectiveStandards (import.meta.url + verifyPluginRoot), nunca do `pluginRoot`
// recebido por parâmetro. Isso significa que os defaults REAIS do plugin (assets/standards/
// deste repo) sempre aparecem no índice de standards — omitir o 2º argumento de
// buildContextIndex não é mais forma de suprimi-los (a supressão real é
// .context/standards.local.yaml `disable:`, D5). O teste antigo assumia o contrário; foi
// reescrito para o contrato novo em vez de continuar testando um comportamento removido.
test("buildContextIndex: pluginRoot não controla mais os standards — defaults reais do plugin aparecem sempre (D5/C16)", () => {
  const proj = makeEmptyProject();
  try {
    // Write a project-level standard — canonical DDC path
    const projStdDir = join(proj.projectRoot, ".context", "engineering", "standards");
    mkdirSync(projStdDir, { recursive: true });
    writeStd(projStdDir, "typescript");

    const idx = buildContextIndex(proj.projectRoot, undefined);
    const own = idx.standards.find(s => s.id === "std-typescript");
    assert.ok(own, "std-typescript do projeto deve aparecer");
    assert.equal(own.origin, "project");
    // Os defaults REAIS deste repo (ex.: std-security, embarcado em assets/standards/)
    // aparecem independentemente do pluginRoot passado — a raiz confiável vem do próprio
    // módulo (D5), não de um argumento que um chamador poderia forjar ou omitir.
    const sec = idx.standards.find(s => s.id === "std-security");
    assert.ok(sec, "std-security (default real do plugin) deve aparecer mesmo sem pluginRoot");
    assert.equal(sec.origin, "default");
  } finally {
    proj.cleanup();
  }
});

// ─── Renderer: [default] tag surfaced in text output ─────────────────────────

// Correção rodada 1: o teste antigo passava um `pluginRoot` forjado (com std-security falso)
// que não tem NENHUM efeito no resultado (D5/C16) — o fixture só confundia o que está sendo
// provado. O comportamento real (defaults reais renderizam com "[default]") não depende de
// pluginRoot algum, então o teste não recebe mais um.
test("renderContextIndexText: default standard is marked [default] in text", async () => {
  const { renderContextIndexText } = await import(
    "../../scripts/lib/context-index.mjs"
  );
  const proj = makeEmptyProject();
  try {
    const idx = buildContextIndex(proj.projectRoot);
    const text = renderContextIndexText(idx);
    assert.match(
      text,
      /\[default\].*std-security|std-security.*\[default\]/,
      "text output must mark default standards with [default]",
    );
  } finally {
    proj.cleanup();
  }
});

// ─── CLI: --plugin flag / CLAUDE_PLUGIN_ROOT — D5 (Correção rodada 1) ─────────
//
// Os três testes abaixo substituem os antigos ("passes pluginRoot, default std appears",
// "text output marks default with [default]", "env CLAUDE_PLUGIN_ROOT fallback: default std
// appears without --plugin"): todos usavam std-security (mesmo id do default real) e por
// isso passavam mesmo que --plugin/CLAUDE_PLUGIN_ROOT tivessem sido completamente ignorados
// — o texto "env CLAUDE_PLUGIN_ROOT must work as fallback" chegava a afirmar o CONTRÁRIO do
// D5. Com um id exclusivo (std-evil) cada um agora prova a negativa que o nome sugeria testar.

test("CLI --plugin: id exclusivo do plugin forjado NÃO aparece no JSON (D5)", () => {
  const proj = makeEmptyProject();
  const plug = makeMaliciousPluginDir();
  try {
    const r = spawnSync(
      "node",
      [CLI, `--project=${proj.projectRoot}`, `--plugin=${plug.pluginRoot}`],
      { encoding: "utf-8" },
    );
    assert.equal(r.status, 0, `exit=${r.status}; stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.ok(out.standards.find(s => s.id === "std-security" && s.origin === "default"), "default real continua aparecendo");
    assert.ok(!out.standards.find(s => s.id === "std-evil"), "--plugin não deve conseguir injetar um standard novo");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

test("CLI --plugin: id exclusivo do plugin forjado NÃO aparece no texto (D5)", () => {
  const proj = makeEmptyProject();
  const plug = makeMaliciousPluginDir();
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
      "default real continua renderizando com [default]",
    );
    assert.doesNotMatch(r.stdout, /std-evil/, "--plugin não deve conseguir injetar um standard novo no texto");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});

test("CLI: CLAUDE_PLUGIN_ROOT forjado NÃO consegue injetar standard (D5 — o env não decide mais isso)", () => {
  const proj = makeEmptyProject();
  const plug = makeMaliciousPluginDir();
  try {
    const r = spawnSync("node", [CLI, `--project=${proj.projectRoot}`], {
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: plug.pluginRoot },
    });
    assert.equal(r.status, 0, `exit=${r.status}; stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.ok(out.standards.find(s => s.id === "std-security" && s.origin === "default"), "default real continua aparecendo");
    assert.ok(!out.standards.find(s => s.id === "std-evil"), "CLAUDE_PLUGIN_ROOT não deve conseguir injetar um standard novo");
  } finally {
    proj.cleanup();
    plug.cleanup();
  }
});
