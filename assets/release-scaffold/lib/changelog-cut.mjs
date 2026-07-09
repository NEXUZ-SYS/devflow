// scripts/lib/changelog-cut.mjs
// Corte de release: renomeia "## [Unreleased]" para "## [X.Y.Z] — data" e
// insere um "## [Unreleased]" novo e vazio no topo. Idempotente: se a seção
// "## [X.Y.Z]" já existe, não corta de novo; sem "## [Unreleased]", é no-op.
// Pura + zero-dep. Chamada pelo bump-version.sh para manter version-files e
// CHANGELOG atômicos (o changelog-guard falha o release se a seção sair vazia).
import { readFileSync, writeFileSync } from "node:fs";

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cutRelease(text, version, date) {
  const s = String(text);
  // já cortado? (seção da versão já existe) → não duplica
  if (new RegExp(`^## \\[${escapeRe(version)}\\]`, "m").test(s)) {
    return { text: s, changed: false };
  }
  const unrel = /^## \[Unreleased\][ \t]*$/m;
  if (!unrel.test(s)) return { text: s, changed: false };
  const replacement = `## [Unreleased]\n\n## [${version}] — ${date}`;
  return { text: s.replace(unrel, replacement), changed: true };
}

// CLI: node changelog-cut.mjs <version> [--date YYYY-MM-DD] [--file CHANGELOG.md]
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const version = argv.find((a) => !a.startsWith("--"));
  const di = argv.indexOf("--date");
  const date = di !== -1 ? argv[di + 1] : new Date().toISOString().slice(0, 10);
  const fi = argv.indexOf("--file");
  const file = fi !== -1 ? argv[fi + 1] : "CHANGELOG.md";
  if (!version) {
    console.error("uso: changelog-cut <version> [--date YYYY-MM-DD] [--file CHANGELOG.md]");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`[changelog-cut] erro ao ler ${file}: ${e.message}`);
    process.exit(1);
  }
  const { text: out, changed } = cutRelease(text, version, date);
  if (changed) {
    writeFileSync(file, out);
    console.log(`[changelog-cut] ${file}: [Unreleased] → [${version}] — ${date}`);
  } else {
    console.log(`[changelog-cut] ${file}: nada a cortar (seção [${version}] já existe ou sem [Unreleased]).`);
  }
  process.exit(0);
}
