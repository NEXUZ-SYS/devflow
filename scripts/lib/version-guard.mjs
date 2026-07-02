// version-guard.mjs — núcleo do controle de versão do DevFlow.
//
// Verdade única do versionamento (ADR de versionamento via pipeline):
//   1) Os 3 version files devem concordar (plugin.json, marketplace.json,
//      .cursor-plugin/plugin.json).
//   2) Em relação à base (default branch), a transição deve ser UM passo válido:
//      none (sem bump, típico de PR de feature), patch+1, minor+1 (patch=0) ou
//      major+1 (minor=patch=0). Qualquer pulo (ex.: 1.23.3→1.23.10), regressão
//      ou salto é rejeitado.
//
// Usado tanto pelo guard de CI (PR) quanto pelo hook local (validação, sem bump).
// Zero dependências externas.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { checkReleaseChangelog } from "./changelog-guard.mjs";

const VERSION_FILES = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/plugin.json",
];

export function parseVersion(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) throw new Error(`versão inválida: ${a} / ${b}`);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

// Classifica a transição base→cur. kind ∈ none|patch|minor|major|invalid.
export function isValidTransition(base, cur) {
  const b = parseVersion(base), c = parseVersion(cur);
  if (!b || !c) return { ok: false, kind: "invalid", reason: "versão não-parseável" };
  const [bM, bm, bp] = b, [cM, cm, cp] = c;
  if (cM === bM && cm === bm && cp === bp) return { ok: true, kind: "none", reason: "sem bump" };
  if (cM === bM && cm === bm && cp === bp + 1) return { ok: true, kind: "patch", reason: "patch +1" };
  if (cM === bM && cm === bm + 1 && cp === 0) return { ok: true, kind: "minor", reason: "minor +1" };
  if (cM === bM + 1 && cm === 0 && cp === 0) return { ok: true, kind: "major", reason: "major +1" };
  // diagnóstico
  let reason;
  try {
    reason = compareVersions(cur, base) < 0 ? "regressão/downgrade de versão" : "salto/pulo de versão (não é um único incremento válido)";
  } catch {
    reason = "transição inválida";
  }
  return { ok: false, kind: "invalid", reason };
}

export function checkConsistency(versions) {
  const vals = Object.values(versions);
  const allEqual = vals.every((v) => v === vals[0]);
  if (allEqual) return { ok: true, version: vals[0] };
  const mismatch = Object.entries(versions)
    .map(([k, v]) => `${k}=${v}`)
    .join(" "); // ex.: plugin=1.24.0 marketplace=1.23.4 cursor=1.24.0
  return { ok: false, mismatch };
}

// ── IO fino (não-testado por unidade; a lógica acima é o núcleo testável) ──

function readVersionFromFile(path) {
  const txt = readFileSync(path, "utf8");
  const m = /"version"\s*:\s*"(\d+\.\d+\.\d+)"/.exec(txt);
  if (!m) throw new Error(`sem version em ${path}`);
  return m[1];
}

export function readRepoVersions(root) {
  const out = {};
  out.plugin = readVersionFromFile(join(root, VERSION_FILES[0]));
  out.marketplace = readVersionFromFile(join(root, VERSION_FILES[1]));
  out.cursor = readVersionFromFile(join(root, VERSION_FILES[2]));
  return out;
}

export function versionAtRef(root, ref) {
  try {
    const txt = execFileSync("git", ["show", `${ref}:${VERSION_FILES[0]}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = /"version"\s*:\s*"(\d+\.\d+\.\d+)"/.exec(txt);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// CLI: node version-guard.mjs --root <dir> [--base <ver> | --base-ref <ref>]
function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--base") args.base = argv[++i];
    else if (argv[i] === "--base-ref") args.baseRef = argv[++i];
  }
  const root = args.root || process.cwd();

  let versions;
  try {
    versions = readRepoVersions(root);
  } catch (e) {
    console.error(`[version-guard] FAIL: ${e.message}`);
    process.exit(1);
  }

  const cons = checkConsistency(versions);
  if (!cons.ok) {
    console.error(`[version-guard] FAIL: version files divergem → ${cons.mismatch}`);
    console.error("  Rode scripts/bump-version.sh para sincronizar os 3 arquivos.");
    process.exit(1);
  }

  let base = args.base;
  if (!base && args.baseRef) base = versionAtRef(root, args.baseRef);

  if (!base) {
    console.log(`[version-guard] OK: version files consistentes em ${cons.version} (sem base p/ checar transição).`);
    process.exit(0);
  }

  const tr = isValidTransition(base, cons.version);
  if (!tr.ok) {
    console.error(`[version-guard] FAIL: transição ${base} → ${cons.version} inválida — ${tr.reason}.`);
    console.error("  Esperado: igual (sem bump), ou +1 patch / +1 minor / +1 major. O bump é feito pela pipeline de release (1 por release).");
    process.exit(1);
  }
  // Release detectado (houve bump) → exigir seção de CHANGELOG não-vazia (fail-loud).
  // Num PR de feature normal (kind=none) o conteúdo acumula em [Unreleased] e não há
  // seção da versão ainda — por isso o guard só dispara quando kind != none.
  if (tr.kind !== "none") {
    let clText = "";
    try {
      clText = readFileSync(join(root, "CHANGELOG.md"), "utf8");
    } catch {
      /* sem CHANGELOG.md — o guard reporta ausência da seção */
    }
    const cg = checkReleaseChangelog(clText, cons.version);
    if (!cg.ok) {
      console.error(`[version-guard] FAIL: ${cg.reason}.`);
      console.error("  Um bump de versão exige a seção correspondente no CHANGELOG. O scripts/bump-version.sh corta [Unreleased]→[X.Y.Z] automaticamente; se a versão foi editada à mão, adicione a seção (não publique release sem notas).");
      process.exit(1);
    }
    console.log(`[version-guard] OK: ${cg.reason}.`);
  }
  console.log(`[version-guard] OK: ${base} → ${cons.version} (${tr.kind}).`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
