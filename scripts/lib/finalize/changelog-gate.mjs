// finalize/changelog-gate.mjs — gate: a seção "## [Unreleased]" do CHANGELOG.md
// deve estar NÃO-vazia (corrige #5: a contrapartida obrigatória do modo
// versioning:pipeline). Reusa extractSection de changelog-extract.mjs (não reimplementa).
// Zero deps além de node:fs.

import { readFileSync } from "node:fs";
import { extractSection } from "../changelog-extract.mjs";

// { ok: true } | { empty: true, reason }
export function assertUnreleasedNonEmpty(changelogText) {
  const sec = extractSection(changelogText, "Unreleased");
  if (sec == null) {
    return { empty: true, reason: "seção ## [Unreleased] ausente no CHANGELOG.md" };
  }
  if (sec.trim() === "") {
    return { empty: true, reason: "seção ## [Unreleased] está vazia — registre as mudanças antes de finalizar (versioning:pipeline)" };
  }
  return { ok: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, path] = process.argv.slice(2);
  if (cmd === "check" && path) {
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch (e) {
      console.error(`changelog-gate: erro ao ler ${path}: ${e.message}`);
      console.log("empty");
      process.exit(1);
    }
    const r = assertUnreleasedNonEmpty(text);
    if (r.ok) { console.log("ok"); process.exit(0); }
    console.error(r.reason);
    console.log("empty");
    process.exit(1);
  } else {
    console.error("uso: changelog-gate check <path-CHANGELOG.md>");
    process.exit(2);
  }
}
