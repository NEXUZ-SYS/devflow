// Task F1 — live-bridge: hard-gate de feature branch + integridade antes de rodar impeccable live.
// Invariantes (Revisão R): `live` é execução de terceiros fora do TCB; hard-gate de branch
// protegida; pin de INTEGRIDADE (sha512) além da versão; consentimento por-invocação (exibe
// comando+versão+hash); SEM marcador de sessão / SEM tocar hooks de pré-execução (regressão (f)).
// spawn + git + CLI mockados via opts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { preflight, run, readPin } from "../../scripts/design/live-bridge.mjs";

const PIN = { version: "3.2.0", integrity: "sha512-TESTHASH==", node: ">=24" };

// checkCli que casa o pin (CLI presente, versão+integridade corretas).
function cliMatching() {
  return () => ({ present: true, version: PIN.version, integrity: PIN.integrity });
}
function makeSpawn() {
  const calls = [];
  const fn = (cmd, args) => { calls.push({ cmd, args }); };
  fn.calls = calls;
  return fn;
}
// Base "tudo verde" numa feature branch. Cada teste sobrescreve o que precisa.
function greenOpts(overrides = {}) {
  return {
    pin: PIN,
    nodeVersion: "24.13.0",
    checkCli: cliMatching(),
    currentBranch: "feature/x",
    protectedBranches: ["main", "develop"],
    ...overrides,
  };
}

// ── (a) branch protegida → run recusa, spawn NÃO chamado ─────────────────────────────────────
test("run: branch protegida → recusa (hard-gate), spawn não chamado", () => {
  const spawn = makeSpawn();
  // consentimento true de propósito: o hard-gate tem de vencer mesmo assim.
  const r = run(greenOpts({ currentBranch: "main", consent: true, spawn }));
  assert.equal(r.started, false);
  assert.match(r.message, /protegida|feature branch/i);
  assert.equal(spawn.calls.length, 0);
});

test("preflight: branch protegida → onProtectedBranch:true, ready:false", () => {
  const pf = preflight(greenOpts({ currentBranch: "main" }));
  assert.equal(pf.onProtectedBranch, true);
  assert.equal(pf.ready, false);
});

test("preflight: branch desconhecida (null) → tratada como protegida (fail-closed)", () => {
  const pf = preflight(greenOpts({ currentBranch: null }));
  assert.equal(pf.onProtectedBranch, true);
});

// ── (b) Node<24 / CLI ausente → ready:false, no-op ───────────────────────────────────────────
test("Node < 24 → ready:false e run no-op (spawn não chamado)", () => {
  const spawn = makeSpawn();
  const opts = greenOpts({ nodeVersion: "20.11.0", consent: true, spawn });
  assert.equal(preflight(opts).node24, false);
  assert.equal(preflight(opts).ready, false);
  const r = run(opts);
  assert.equal(r.started, false);
  assert.match(r.message, /Node/);
  assert.equal(spawn.calls.length, 0);
});

test("CLI ausente → ready:false e run no-op com comando proposto (spawn não chamado)", () => {
  const spawn = makeSpawn();
  const opts = greenOpts({ checkCli: () => ({ present: false, version: null, integrity: null }), consent: true, spawn });
  const pf = preflight(opts);
  assert.equal(pf.cliPresent, false);
  assert.equal(pf.ready, false);
  const r = run(opts);
  assert.equal(r.started, false);
  assert.match(r.message, /impeccable@3\.2\.0 live/);
  assert.equal(spawn.calls.length, 0);
});

// ── (d) integridade divergente → recusa ──────────────────────────────────────────────────────
test("integridade divergente do pin → recusa, spawn não chamado", () => {
  const spawn = makeSpawn();
  const opts = greenOpts({
    checkCli: () => ({ present: true, version: PIN.version, integrity: "sha512-OUTRO==" }),
    consent: true,
    spawn,
  });
  assert.equal(preflight(opts).integrityOk, false);
  const r = run(opts);
  assert.equal(r.started, false);
  assert.match(r.message, /integridade|diverge/i);
  assert.equal(spawn.calls.length, 0);
});

test("versão divergente do pin → integrityOk:false", () => {
  const opts = greenOpts({ checkCli: () => ({ present: true, version: "9.9.9", integrity: PIN.integrity }) });
  assert.equal(preflight(opts).integrityOk, false);
});

// ── (c) sem consentimento → só imprime comando+versão+hash, spawn NÃO chamado ────────────────
test("sem consentimento → exibe comando+versão+hash, spawn não chamado", () => {
  const spawn = makeSpawn();
  const opts = greenOpts({ spawn }); // consent omitido
  assert.equal(preflight(opts).ready, true, "pré-condição: tudo verde exceto consentimento");
  const r = run(opts);
  assert.equal(r.started, false);
  assert.match(r.message, /npx impeccable@3\.2\.0 live/);
  assert.match(r.message, /3\.2\.0/);
  assert.match(r.message, /sha512-TESTHASH==/);
  assert.equal(spawn.calls.length, 0);
});

// ── (e) tudo verde + consentimento → spawn chamado 1x com os args certos ─────────────────────
test("tudo verde + consentimento → spawn chamado 1x com args corretos", () => {
  const spawn = makeSpawn();
  const r = run(greenOpts({ consent: true, spawn }));
  assert.equal(r.started, true);
  assert.equal(spawn.calls.length, 1);
  assert.deepEqual(spawn.calls[0], { cmd: "npx", args: ["-y", "impeccable@3.2.0", "live"] });
});

// ── (f) REGRESSÃO: módulo não referencia hook de pré-execução nem escreve marcador ───────────
test("regressão: o source não referencia pre-tool-use nem escreve marcador de sessão", () => {
  const src = readFileSync(fileURLToPath(new URL("../../scripts/design/live-bridge.mjs", import.meta.url)), "utf-8");
  assert.ok(!/pre-tool-use/i.test(src), "não deve referenciar o hook pre-tool-use");
  assert.ok(!/PreToolUse/.test(src), "não deve referenciar PreToolUse");
  assert.ok(!/\.context\/runtime/.test(src), "não deve escrever/tocar .context/runtime");
  assert.ok(!/writeFileSync|writeFile\(|appendFileSync|mkdirSync/.test(src), "não deve escrever arquivos");
});

// ── sanity do pin real (arquivo pode estar ausente/gitignored) ───────────────────────────────
test("readPin: parseia .pinned-version quando presente", () => {
  const pin = readPin();
  if (pin.version != null) {
    assert.match(pin.version, /^\d+\.\d+\.\d+$/);
    assert.ok(pin.integrity == null || /^sha512-/.test(pin.integrity));
  }
});
