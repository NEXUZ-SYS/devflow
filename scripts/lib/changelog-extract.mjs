// changelog-extract.mjs — extrai a seção de uma versão do CHANGELOG.md para
// virar as release notes da GitHub Release. Zero dependências.
//
// Uso (CLI): node scripts/lib/changelog-extract.mjs <version> [--file CHANGELOG.md]
//   imprime o corpo da seção "## [<version>]" (sem o header) até o próximo "## [".
//   exit 1 se a versão não for encontrada.

import { readFileSync } from "node:fs";

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Retorna o corpo da seção (string, possivelmente vazia) ou null se ausente.
export function extractSection(text, version) {
  const lines = String(text).split("\n");
  const headerRe = new RegExp(`^## \\[${escapeRe(version)}\\]`);
  const anyHeaderRe = /^## \[/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (anyHeaderRe.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

function main(argv) {
  const version = argv[0];
  let file = "CHANGELOG.md";
  const fi = argv.indexOf("--file");
  if (fi !== -1 && argv[fi + 1]) file = argv[fi + 1];
  if (!version) {
    console.error("uso: changelog-extract <version> [--file CHANGELOG.md]");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`[changelog-extract] erro ao ler ${file}: ${e.message}`);
    process.exit(2);
  }
  const sec = extractSection(text, version);
  if (sec == null) {
    console.error(`[changelog-extract] seção "## [${version}]" não encontrada em ${file}`);
    process.exit(1);
  }
  process.stdout.write(sec + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
