#!/usr/bin/env node
// verify-contract-guard-cli.mjs — R-C2: guard do contrato NO CI, contra o merge-base.
// O config-guard existente só dispara em branch protegida; o ataque a verify.* acontece
// na feature branch. Este compara o .devflow.yaml do merge-base vs HEAD e bloqueia
// enfraquecimento (remoção de sinal, proposto inválido/inline).
import { execFileSync } from "node:child_process";
import { detectWeakenings } from "./devflow-config-guard.mjs";

const CONFIG_REL = ".context/.devflow.yaml";
const arg = (k, d) => (process.argv.find(a => a.startsWith(`${k}=`))?.split("=")[1]) ?? d;
const root = arg("--root", ".");
const baseRef = arg("--base-ref", "origin/main");
const ci = process.argv.includes("--ci") || process.env.CI === "true";
const git = (args) => { try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore","pipe","ignore"] }); } catch { return null; } };

const base = (git(["merge-base", "HEAD", baseRef]) || "").trim();
if (!base) {
  if (ci) { console.error(`✗ verify-contract-guard: merge-base com '${baseRef}' não resolve (fail-closed em CI)`); process.exit(1); }
  console.log(`✓ verify-contract-guard: sem merge-base local — skip`); process.exit(0);
}
const current = git(["show", `${base}:${CONFIG_REL}`]);
const proposed = git(["show", `HEAD:${CONFIG_REL}`]);
if (current == null || proposed == null) { console.log("✓ verify-contract-guard: sem .devflow.yaml na base/HEAD — nada a comparar"); process.exit(0); }

const weakenings = detectWeakenings(current, proposed).filter(w => /verify/i.test(w));
if (weakenings.length) {
  console.error("✗ verify-contract-guard: contrato verify: enfraquecido vs merge-base:");
  for (const w of weakenings) console.error("  " + w);
  process.exit(1);
}
console.log("✓ verify-contract-guard: contrato verify: íntegro vs merge-base");
process.exit(0);
