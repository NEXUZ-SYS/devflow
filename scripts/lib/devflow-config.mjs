// devflow-config.mjs — parser ÚNICO de .context/.devflow.yaml (ADR-011).
// Zero dependências. Replica a semântica autoritativa do hooks/post-tool-use
// (parse_auto_finish + read_yaml_field), com fallback explícito e idêntico —
// e SEM os bugs do parser antigo (comentário inline, chave-substring, escopo).
//
// Uso (CLI):
//   node scripts/lib/devflow-config.mjs read-autofinish <path>  → disabled | all | {"bump":..,"commit":..,"push":..,"merge":..}
//   node scripts/lib/devflow-config.mjs read-versioning <path>  → local | pipeline | none
// Qualquer erro de leitura/parse/arquivo-grande imprime o fallback seguro.

import { readFileSync, statSync } from "node:fs";

const MAX_BYTES = 256 * 1024; // cap anti-ReDoS / arquivo absurdo → fallback

function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// Remove comentário inline: primeiro espaço + '#' até o fim.
function stripInlineComment(v) {
  return String(v).replace(/\s+#.*$/, "").trim();
}

function leadingWidth(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

// Retorna apenas as linhas DENTRO do bloco top-level `git:` (fecha na 1ª linha
// não-indentada não-vazia). Espelha o fallback do read_yaml_field do hook.
function gitBlock(text) {
  const lines = normalizeNewlines(text).split("\n");
  const block = [];
  let inGit = false;
  for (const line of lines) {
    if (!inGit) {
      if (/^git:\s*$/.test(line)) inGit = true;
      continue;
    }
    if (line.trim() !== "" && !/^\s/.test(line)) break; // dedent → fim do bloco
    block.push(line);
  }
  return block;
}

// Localiza uma chave escalar dentro do bloco, ANCORADA por `:` (não substring).
// `autoFinishMode:` NÃO casa com `autoFinish`.
function findScalar(block, field) {
  const esc = String(field).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // API genérica (readField): escapar metacaracteres
  const re = new RegExp("^(\\s*)" + esc + ":\\s*(.*)$");
  for (let i = 0; i < block.length; i++) {
    const m = block[i].match(re);
    if (m) return { indent: m[1].length, raw: stripInlineComment(m[2]), idx: i };
  }
  return null;
}

// Coleta as 4 sub-flags de um `autoFinish:` sem valor (objeto granular).
// Para na 1ª linha de indentação <= a do pai (irmão) ou fim do bloco.
function collectGranular(block, startIdx, parentIndent) {
  const keys = { bump: false, commit: false, push: false, merge: false };
  let found = 0;
  for (let i = startIdx + 1; i < block.length; i++) {
    const line = block[i];
    if (line.trim() === "") continue;
    if (leadingWidth(line) <= parentIndent) break; // irmão/dedent
    const m = line.match(/^\s*(bump|commit|push|merge):\s*(.*)$/);
    if (m) {
      keys[m[1]] = stripInlineComment(m[2]) === "true";
      found++;
    }
  }
  return found > 0 ? keys : "disabled";
}

// disabled | all | { bump, commit, push, merge }
export function readAutoFinish(src) {
  try {
    const block = gitBlock(src);
    const f = findScalar(block, "autoFinish");
    if (!f) return "disabled";
    if (f.raw === "true") return "all";
    if (f.raw === "false") return "disabled";
    if (f.raw === "") return collectGranular(block, f.idx, f.indent);
    return "disabled"; // qualquer outro escalar (espelha o `else` do Python)
  } catch {
    return "disabled";
  }
}

// Leitura genérica de um campo escalar do bloco git: (ex.: prCli, strategy).
// Retorna a string (comentário inline já removido) ou null se ausente.
export function readField(src, name) {
  try {
    const f = findScalar(gitBlock(src), name);
    return f ? f.raw : null;
  } catch {
    return null;
  }
}

// local | pipeline | none  (default local — preserva o check != pipeline && != none do hook)
export function readVersioning(src) {
  try {
    const f = findScalar(gitBlock(src), "versioning");
    if (!f) return "local";
    if (f.raw === "pipeline") return "pipeline";
    if (f.raw === "none") return "none";
    return "local";
  } catch {
    return "local";
  }
}

function readTextOrNull(path) {
  try {
    if (statSync(path).size > MAX_BYTES) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === "read-autofinish") {
    const text = readTextOrNull(argv[1]);
    const r = text == null ? "disabled" : readAutoFinish(text);
    process.stdout.write((typeof r === "string" ? r : JSON.stringify(r)) + "\n");
  } else if (cmd === "read-versioning") {
    const text = readTextOrNull(argv[1]);
    process.stdout.write((text == null ? "local" : readVersioning(text)) + "\n");
  } else if (cmd === "read-field") {
    const name = argv[1];
    const text = readTextOrNull(argv[2]);
    if (!name) { console.error("uso: devflow-config read-field <campo> <path>"); process.exit(2); }
    process.stdout.write((text == null ? "" : (readField(text, name) ?? "")) + "\n");
  } else {
    console.error("uso: devflow-config <read-autofinish|read-versioning|read-field <campo>> <path>");
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
