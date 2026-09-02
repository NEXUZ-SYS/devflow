/**
 * Gate — init e context-sync delegam ao reconcile; /devflow update só aponta.
 * Run: node --test tests/skills/test-skill-reconcile-wiring.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SYNC = readFileSync("skills/context-sync/SKILL.md", "utf-8");
const INIT = readFileSync("skills/project-init/SKILL.md", "utf-8");
const CMD = readFileSync("commands/devflow.md", "utf-8");

test("context-sync NÃO instrui mais semeadura aditiva incondicional", () => {
  assert.doesNotMatch(SYNC, /Para cada `stack` ausente no manifest, semear/,
    "a instrução aditiva é a que reproduz o bug: poda manual era desfeita no sync seguinte");
});

test("context-sync delega ao reconcile", () => {
  assert.match(SYNC, /devflow-stacks\.mjs" reconcile/);
});

test("context-sync exige confirmação humana antes da poda", () => {
  const i = SYNC.indexOf("reconcile");
  const trecho = SYNC.slice(i, i + 900);
  assert.match(trecho, /--yes/, "deve explicar como confirmar");
  assert.match(trecho, /pergunt|confirm/i, "poda é destrutiva: nunca silenciosa");
});

test("project-init delega ao reconcile em vez de semear as 7 séries", () => {
  assert.match(INIT, /devflow-stacks\.mjs" reconcile/);
});

test("o /devflow update apenas APONTA — nunca muta o manifesto do projeto", () => {
  const start = CMD.indexOf("### `/devflow update`");
  const end = CMD.indexOf("### `/devflow language");
  assert.ok(start !== -1 && end > start, "seção do update deve existir");
  const secao = CMD.slice(start, end);
  assert.doesNotMatch(secao, /stacks\.mjs" reconcile/,
    "update atualiza plugin e toolchain — reconciliar manifesto é do sync");
});

test("o update oferece o sync como próximo passo", () => {
  assert.match(CMD, /Escopo de vers[ãa]o de stacks/);
});
