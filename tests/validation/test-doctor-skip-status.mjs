#!/usr/bin/env node
// tests/validation/test-doctor-skip-status.mjs
// SKIP é o quarto status do doctor: "não consigo verificar aqui", distinto de
// OK ("verifiquei, está certo") e FAIL ("verifiquei, está errado").
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runChecks } from "../../scripts/lib/doctor.mjs";

const CLI = resolve("scripts/doctor.mjs");

// HOME sem ~/.claude/plugins força os checks de plugin a devolverem SKIP.
function skipEnv() {
  const root = mkdtempSync(join(tmpdir(), "doctor-skip-"));
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(join(cwd, ".context"), { recursive: true });
  mkdirSync(home, { recursive: true });
  return { root, home, cwd, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function runCli(cwd, home, args) {
  try {
    return { status: 0, stdout: execFileSync("node", [CLI, ...args], { cwd, encoding: "utf-8", env: { ...process.env, HOME: home } }) };
  } catch (e) {
    return { status: e.status, stdout: e.stdout?.toString() || "" };
  }
}

test("SEV_RANK ordena SKIP depois de OK", async () => {
  const e = skipEnv();
  const results = await runChecks(
    { cwd: e.cwd, home: e.home, which: () => false, exec: () => ({ status: 1, stdout: "", stderr: "" }), today: "2026-09-01" },
    ["plugin-scope", "devflow-config"],
  );
  const idx = results.map(r => r.status);
  assert.ok(idx.indexOf("SKIP") > idx.indexOf("WARN"), "SKIP vem depois dos acionáveis");
  e.cleanup();
});

test("o CLI imprime SKIP com ícone próprio, sem undefined", () => {
  const e = skipEnv();
  const out = runCli(e.cwd, e.home, ["--check", "plugin-declared-installed"]);
  assert.match(out.stdout, /\[SKIP\]/);
  assert.doesNotMatch(out.stdout, /undefined \[SKIP\]/);
  e.cleanup();
});

test("o CLI conta SKIP no resumo", () => {
  const e = skipEnv();
  const out = runCli(e.cwd, e.home, ["--check", "plugin-declared-installed"]);
  assert.match(out.stdout, /1 SKIP/);
  assert.doesNotMatch(out.stdout, /NaN/);
  e.cleanup();
});

test("SKIP não faz o doctor sair com código de erro", () => {
  const e = skipEnv();
  assert.equal(runCli(e.cwd, e.home, ["--check", "plugin-declared-installed"]).status, 0);
  e.cleanup();
});

test("SKIP aparece no --json", () => {
  const e = skipEnv();
  const out = runCli(e.cwd, e.home, ["--check", "plugin-scope", "--json"]);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.results[0].status, "SKIP");
  e.cleanup();
});
