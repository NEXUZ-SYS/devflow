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
import { parseYaml } from "./frontmatter.mjs";

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

// ── Contrato verify: (pipeline de sinal verificável, ADR-013) ──────────────
// Lido pelo parser único (ADR-011); delega o parse a frontmatter.mjs. NÃO toca
// em readAutoFinish/readVersioning (paridade bit-exata com o fallback do hook).

export const VERIFY_ALLOWLIST = new Set(["node","npm","pnpm","python","python3","pytest","make","bash","sh"]);
const VERIFY_SIGNALS = new Set(["unit","integration","e2e","lint"]);

// R-C1: rejeita execução de código inline varrendo TODOS os tokens do argv (não só argv[1]),
// sensível ao interpretador. Fecha os vetores provados pela revisão: node -e/--eval/-p/--print/-pe
// (e formas =...), bash/sh -c e bundles -lc/-ic/-xc, python -c. Exportada para reuso no config-guard.
export function assertNoInlineCode(name, argv) {
  const bin = argv[0];
  for (const tok of argv.slice(1)) {
    // bash/sh: qualquer bundle de dash-único contendo 'c' → -c/-lc/-ic/-xc/…
    if ((bin === "bash" || bin === "sh") && /^-[a-z]*c/i.test(tok))
      throw new Error(`verify.${name}: '${tok}' executa comando inline (shell -c/-lc/-ic/-xc proibido)`);
    if (bin === "node") {
      // -e/--eval/-p/--print/-pe (e formas =…) avaliam código inline.
      if (/^(-e|--eval|-p|--print|-pe)(=.*)?$/.test(tok))
        throw new Error(`verify.${name}: '${tok}' avalia código inline (node -e/--eval/-p/--print/-pe proibido)`);
      // V1: --import/--loader/--experimental-loader aceitam data:/http: (código externo inline via ESM).
      // Um runner de teste usa caminho de script, não loaders; um caso legítimo usa wrapper ["bash", …].
      if (/^(--import|--loader|--experimental-loader)(=.*)?$/.test(tok))
        throw new Error(`verify.${name}: '${tok}' pode injetar código externo (node --import/--loader proibido; use um wrapper de script)`);
    }
    // V2: python -c colado (-cCODE) e em cluster (-Ic/-Ec) — não só a forma separada /^-c$/.
    if ((bin === "python" || bin === "python3") && /^-[A-Za-z]*c/.test(tok))
      throw new Error(`verify.${name}: '${tok}' avalia código inline (python -c/-cCODE/-Ic proibido)`);
  }
}

// Lê e valida o bloco verify:. Vocabulário fechado unit|integration|e2e|lint.
// Comandos são argv arrays; argv[0] em allowlist; nenhum token é código inline.
// Sem bloco → { signals:{}, onTaskComplete:[] } (D9: ausência não lança).
// R-C6: distingue "sem verify:" (ausência legítima) de "verify: presente mas parse falhou"
// (fail-closed) — o downgrade silencioso para warn-only é o teatro que a feature mata.
export function readVerify(src) {
  const text = String(src);
  // V3: casar toda grafia que o parser subset honra como a chave `verify` (inclui "verify :" com
  // espaço/tab antes do ':'), senão um parse-falho nessa grafia cairia em warn-only silencioso.
  const hasVerifyText = /^verify\s*:(\s|$)/m.test(text);
  let data;
  try { data = parseYaml(text) || {}; }
  catch (e) {
    if (hasVerifyText) throw new Error(`verify: presente mas o .devflow.yaml não parseia (${e.message}) — fail-closed`);
    data = {};
  }
  const v = data.verify;
  if (v == null) {
    if (hasVerifyText) throw new Error("verify: presente no texto mas não parseou como mapa — fail-closed");
    return { signals: {}, onTaskComplete: [] };
  }
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("verify: deve ser um mapa");

  const signals = {};
  for (const [key, val] of Object.entries(v)) {
    if (key === "onTaskComplete") continue;
    if (!VERIFY_SIGNALS.has(key)) throw new Error(`sinal desconhecido '${key}' (vocabulário: unit, integration, e2e, lint)`);
    if (!Array.isArray(val)) throw new Error(`verify.${key}: deve ser um array argv (string não é permitida)`);
    if (val.length === 0) throw new Error(`verify.${key}: comando vazio`);
    if (val.some(x => typeof x !== "string")) throw new Error(`verify.${key}: todos os itens do argv devem ser strings`);
    if (!VERIFY_ALLOWLIST.has(val[0])) throw new Error(`verify.${key}: argv[0] '${val[0]}' fora da allowlist`);
    assertNoInlineCode(key, val);
    signals[key] = val;
  }

  let onTaskComplete = v.onTaskComplete ?? [];
  if (!Array.isArray(onTaskComplete)) throw new Error("verify.onTaskComplete: deve ser um array");
  for (const s of onTaskComplete) {
    if (!(s in signals)) throw new Error(`verify.onTaskComplete: '${s}' não é um sinal declarado`);
  }
  return { signals, onTaskComplete };
}

export function readVerifyFromPath(path) {
  const text = readTextOrNull(path);
  return text == null ? { signals: {}, onTaskComplete: [] } : readVerify(text);
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
  } else if (cmd === "read-verify") {
    // Fail-closed: se o verify: estiver presente mas inválido/inseguro, sai !=0.
    const text = readTextOrNull(argv[1]);
    try {
      const r = text == null ? { signals: {}, onTaskComplete: [] } : readVerify(text);
      process.stdout.write(JSON.stringify(r) + "\n");
    } catch (e) {
      console.error(String(e.message || e));
      process.exit(1);
    }
  } else {
    console.error("uso: devflow-config <read-autofinish|read-versioning|read-field <campo>|read-verify> <path>");
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
