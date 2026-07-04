// Task E2 — reconcile-impeccable: migrar um impeccable CRU já instalado.
// Invariantes de segurança (Revisão R): JSON.parse guardado (malformado → não crash),
// allowlist dos 45 rule-ids (rejeita desconhecidos/metacaracteres), edição de settings.json
// CIRÚRGICA (backup .bak + revalida + atômica, preserva os demais hooks), consent-gated
// (funções retornam plano; só disableImpeccableHook(apply:true) muta).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectRawImpeccable,
  importWaivers,
  planReconciliation,
  disableImpeccableHook,
  RULE_ALLOWLIST,
} from "../../scripts/design/reconcile-impeccable.mjs";

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

const IMPECCABLE_HOOK = { type: "command", command: "node .claude/skills/impeccable/hook.mjs" };
const DEVFLOW_HOOK = { type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use" };

function seedRawImpeccable(dir) {
  mkdirSync(join(dir, ".claude", "skills", "impeccable"), { recursive: true });
  mkdirSync(join(dir, ".impeccable"), { recursive: true });
  const settings = {
    hooks: {
      PostToolUse: [
        { matcher: "Write|Edit", hooks: [IMPECCABLE_HOOK] },
        { matcher: "Write|Edit", hooks: [DEVFLOW_HOOK] },
      ],
    },
  };
  const settingsPath = join(dir, ".claude", "settings.json");
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  const configPath = join(dir, ".impeccable", "config.json");
  writeFileSync(configPath, JSON.stringify({ ignore: ["gradient-text", "wide-tracking", "unknown-rule", "../../etc", "foo;bar"] }));
  return { settingsPath, configPath };
}

// ── (a) detecta skill dir + hook + config de fixture ─────────────────────────────────────────
test("detectRawImpeccable acha skill dir + hook + config", () => {
  const d = tmp("rec-detect-");
  const { settingsPath, configPath } = seedRawImpeccable(d);
  const det = detectRawImpeccable(d);
  assert.equal(det.present, true);
  assert.equal(det.skillDir, join(d, ".claude", "skills", "impeccable"));
  assert.equal(det.hookInSettings, true);
  assert.equal(det.settingsPath, settingsPath);
  assert.equal(det.configPath, configPath);
});

test("detectRawImpeccable em projeto limpo → present:false", () => {
  const d = tmp("rec-clean-");
  const det = detectRawImpeccable(d);
  assert.equal(det.present, false);
  assert.equal(det.skillDir, null);
  assert.equal(det.hookInSettings, false);
  assert.equal(det.configPath, null);
});

// ── (b) importWaivers aceita válidos e rejeita desconhecido + ../etc + id com ; ───────────────
test("importWaivers: aceita válidos, rejeita desconhecido/metacaracteres", () => {
  const d = tmp("rec-waiver-");
  const { configPath } = seedRawImpeccable(d);
  const { waivers, rejected } = importWaivers(configPath);
  assert.deepEqual(waivers.sort(), ["gradient-text", "wide-tracking"]);
  assert.ok(rejected.includes("unknown-rule"), "id fora do allowlist → rejected");
  assert.ok(rejected.includes("../../etc"), "path traversal → rejected");
  assert.ok(rejected.includes("foo;bar"), "id com ; → rejected");
  // nenhum id rejeitado vaza para waivers
  for (const r of rejected) assert.ok(!waivers.includes(r));
});

test("importWaivers: todo id válido pertence ao allowlist das 45 regras", () => {
  const d = tmp("rec-allow-");
  mkdirSync(join(d, ".impeccable"), { recursive: true });
  const configPath = join(d, ".impeccable", "config.json");
  writeFileSync(configPath, JSON.stringify({ disabled: ["single-font", "tiny-text", "not-a-rule"] }));
  const { waivers, rejected } = importWaivers(configPath);
  for (const w of waivers) assert.ok(RULE_ALLOWLIST.has(w));
  assert.ok(rejected.includes("not-a-rule"));
});

// ── (c) config malformado → não lança, retorna vazio ─────────────────────────────────────────
test("importWaivers: config malformado → {waivers:[],rejected:[]} sem throw", () => {
  const d = tmp("rec-bad-");
  mkdirSync(join(d, ".impeccable"), { recursive: true });
  const configPath = join(d, ".impeccable", "config.json");
  writeFileSync(configPath, "{ isto não é json ");
  assert.doesNotThrow(() => importWaivers(configPath));
  assert.deepEqual(importWaivers(configPath), { waivers: [], rejected: [] });
});

test("importWaivers: config ausente → vazio sem throw", () => {
  assert.deepEqual(importWaivers(join(tmp("rec-none-"), ".impeccable", "config.json")), { waivers: [], rejected: [] });
});

// ── planReconciliation: monta o plano sem executar ───────────────────────────────────────────
test("planReconciliation: descreve ações e settingsBackup sem mutar", () => {
  const d = tmp("rec-plan-");
  const { settingsPath } = seedRawImpeccable(d);
  const before = readFileSync(settingsPath, "utf-8");
  const plan = planReconciliation(d);
  assert.equal(plan.settingsBackup, settingsPath + ".bak");
  assert.ok(plan.actions.some((a) => /hook/i.test(a) && /impeccable/i.test(a)));
  assert.ok(plan.actions.some((a) => /waiver/i.test(a)));
  assert.ok(plan.actions.some((a) => /skill/i.test(a)));
  // não mutou nada
  assert.equal(readFileSync(settingsPath, "utf-8"), before);
  assert.equal(existsSync(settingsPath + ".bak"), false);
});

// ── (d) disableImpeccableHook(apply:true) remove só o impeccable, preserva DevFlow, cria .bak ──
test("disableImpeccableHook(apply:true): remove só impeccable, preserva DevFlow, cria .bak", () => {
  const d = tmp("rec-apply-");
  const { settingsPath } = seedRawImpeccable(d);
  const res = disableImpeccableHook(settingsPath, { apply: true });

  assert.equal(res.applied, true);
  assert.equal(res.changed, true);
  assert.equal(res.backupPath, settingsPath + ".bak");
  assert.ok(existsSync(settingsPath + ".bak"), ".bak criado");
  assert.deepEqual(res.removed, [IMPECCABLE_HOOK.command]);
  assert.ok(res.preserved.includes(DEVFLOW_HOOK.command));

  // settings reescrito: sem impeccable, COM o hook do DevFlow.
  const after = JSON.parse(readFileSync(settingsPath, "utf-8"));
  const cmds = after.hooks.PostToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(!cmds.some((c) => /impeccable/i.test(c)), "hook impeccable removido");
  assert.ok(cmds.includes(DEVFLOW_HOOK.command), "hook DevFlow preservado");

  // .bak conserva o original (ainda com o impeccable).
  const bak = JSON.parse(readFileSync(settingsPath + ".bak", "utf-8"));
  const bakCmds = bak.hooks.PostToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(bakCmds.some((c) => /impeccable/i.test(c)), ".bak preserva o original");
});

test("disableImpeccableHook(apply:true): grupo MISTO preserva o hook DevFlow interno", () => {
  const d = tmp("rec-mixed-");
  mkdirSync(join(d, ".claude"), { recursive: true });
  const settingsPath = join(d, ".claude", "settings.json");
  writeFileSync(settingsPath, JSON.stringify({
    hooks: { PostToolUse: [{ matcher: "Write|Edit", hooks: [IMPECCABLE_HOOK, DEVFLOW_HOOK] }] },
  }, null, 2));
  const res = disableImpeccableHook(settingsPath, { apply: true });
  assert.equal(res.changed, true);
  const after = JSON.parse(readFileSync(settingsPath, "utf-8"));
  const cmds = after.hooks.PostToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.deepEqual(cmds, [DEVFLOW_HOOK.command]);
});

// ── (e) apply:false não muta nada ────────────────────────────────────────────────────────────
test("disableImpeccableHook(apply:false): retorna plano, não muta, sem .bak", () => {
  const d = tmp("rec-plan2-");
  const { settingsPath } = seedRawImpeccable(d);
  const before = readFileSync(settingsPath, "utf-8");
  const res = disableImpeccableHook(settingsPath); // default apply:false
  assert.equal(res.applied, false);
  assert.equal(res.changed, true);
  assert.deepEqual(res.removed, [IMPECCABLE_HOOK.command]);
  assert.equal(res.backupPath, settingsPath + ".bak"); // caminho PLANEJADO
  // disco intacto
  assert.equal(readFileSync(settingsPath, "utf-8"), before);
  assert.equal(existsSync(settingsPath + ".bak"), false);
});

test("disableImpeccableHook: settings.json malformado → não lança, não edita", () => {
  const d = tmp("rec-badset-");
  mkdirSync(join(d, ".claude"), { recursive: true });
  const settingsPath = join(d, ".claude", "settings.json");
  writeFileSync(settingsPath, "{ não é json ");
  const before = readFileSync(settingsPath, "utf-8");
  let res;
  assert.doesNotThrow(() => { res = disableImpeccableHook(settingsPath, { apply: true }); });
  assert.equal(res.applied, false);
  assert.match(res.error, /malformado/);
  assert.equal(readFileSync(settingsPath, "utf-8"), before);
});

test("disableImpeccableHook: sem hook impeccable → no-op idempotente sem .bak", () => {
  const d = tmp("rec-noop-");
  mkdirSync(join(d, ".claude"), { recursive: true });
  const settingsPath = join(d, ".claude", "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Write", hooks: [DEVFLOW_HOOK] }] } }, null, 2));
  const res = disableImpeccableHook(settingsPath, { apply: true });
  assert.equal(res.applied, true);
  assert.equal(res.changed, false);
  assert.equal(res.backupPath, null);
  assert.equal(existsSync(settingsPath + ".bak"), false);
});

test("allowlist tem exatamente 45 regras", () => {
  assert.equal(RULE_ALLOWLIST.size, 45);
});
