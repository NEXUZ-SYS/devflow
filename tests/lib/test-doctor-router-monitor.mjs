// tests/lib/test-doctor-router-monitor.mjs — o monitor é sempre ligado; o onboarding só verifica que o mod carrega.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKS } from "../../scripts/lib/doctor.mjs";

const check = CHECKS.find((c) => c.id === "router-monitor");
const cwd = () => mkdtempSync(join(tmpdir(), "doctor-rm-")); // sem .context: o check não depende do repo

test("check registrado, não destrutivo, severidade warn", () => {
  assert.ok(check);
  assert.equal(check.destructive, false);
  assert.equal(check.severity, "warn");
});

test("versão testada → OK, citando a versão", () => {
  const r = check.run({ cwd: cwd(), claudeVersion: "2.1.296 (Claude Code)" });
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /2\.1\.296/);
});

test("anterior a 2.1.293 → WARN com reparo", () => {
  const r = check.run({ cwd: cwd(), claudeVersion: "2.1.292 (Claude Code)" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /2\.1\.293/);
  assert.match(r.repair, /Atualize o Claude Code/);
});

test("versão ilegível → WARN", () => {
  const r = check.run({ cwd: cwd(), claudeVersion: "" });
  assert.equal(r.status, "WARN");
  assert.match(r.repair, /claude --version/);
});
