#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SCRIPT = join(process.cwd(), "scripts", "devflow-knowledge.mjs");

test("devflow-knowledge new: cria doc scaffold a partir do tipo", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-new-"));
  execFileSync("node", [SCRIPT, "new", "--type=business-vision", "--name=vision", `--project=${root}`], { stdio: "pipe" });
  const out = join(root, ".context", "business", "vision.md");
  assert.ok(existsSync(out));
  assert.match(readFileSync(out, "utf-8"), /type: knowledge/);
  rmSync(root, { recursive: true, force: true });
});

test("devflow-knowledge audit: reporta K2 placeholder e sai !=0", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-audit-"));
  execFileSync("node", [SCRIPT, "new", "--type=business-vision", "--name=vision", `--project=${root}`], { stdio: "pipe" });
  let stdout = "", code = 0;
  try {
    stdout = execFileSync("node", [SCRIPT, "audit", "--name=vision", `--project=${root}`], { encoding: "utf-8", stdio: "pipe" });
  } catch (e) {
    code = e.status;
    stdout = (e.stdout || "").toString();
  }
  assert.equal(code, 1);          // doc com placeholder reprova
  assert.match(stdout, /K2/);
  rmSync(root, { recursive: true, force: true });
});
