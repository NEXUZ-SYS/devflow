// scripts/lib/framework-version.mjs — resolução da versão do framework no
// nível do PROJETO.
//
// Duas formas de sonda, ambas declaradas no YAML do perfil (nunca em código):
//   { file, pattern }              — lê um arquivo, extrai o grupo 1
//   { glob, pattern, aggregate }   — varre caminhos, agrega os grupos 1
//
// Acrescentar um perfil irmão (rails.yaml) não exige mudança de código.
//
// Per Dependency Policy: pure node:*.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

export const CONFIDENCE = {
  HIGH: "high", MEDIUM: "medium", AMBIGUOUS: "ambiguous", UNKNOWN: "unknown",
};

const MAX_DEPTH = 6;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", "__pycache__"]);
// S1 (fase R): o pattern vem do bundle do plugin (TCB — loadProfiles só lê de
// pluginRoot/profiles), mas roda contra CONTEÚDO DE ARQUIVO DO PROJETO, que é
// atacável por um repo hostil. Backtracking em `[\s\S]*?` sobre um .gitmodules
// forjado é DoS local. Truncar o input remove a alavanca sem tocar nos patterns.
const MAX_PROBE_INPUT = 256 * 1024;

// Compila o pattern do YAML. Padrão inválido é DADO ruim, não crash: devolve null.
function compile(pattern) {
  try { return new RegExp(pattern); } catch { return null; }
}

function firstGroup(content, re) {
  const m = content.slice(0, MAX_PROBE_INPUT).match(re);
  return m && m[1] ? String(m[1]) : null;
}

// Walk raso, sem seguir symlink, para resolver o `glob` da sonda.
function walk(root, sub, out, depth) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const rel = sub ? join(sub, e.name) : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(root, rel, out, depth + 1);
    else if (e.isFile()) out.push(rel);
  }
}

// Matcher de glob mínimo para as sondas: só `*` (um segmento) e `**` (vários).
function globToRe(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped
    .replace(/\*\*\//g, " ")
    .replace(/\*/g, "[^/]*")
    .replace(/ /g, "(?:.*/)?");
  return new RegExp(`^${body}$`);
}

// Devolve TAMBÉM count/total: a evidência precisa mostrar 48/54, não 54/54.
// Reportar "N de N" onde houve divergência recria a opacidade que escondeu o
// bug original (spec §2: "evidência é lista, não booleano").
export function aggregateMajority(values) {
  const clean = values.filter(Boolean);
  if (clean.length === 0) return { value: null, tie: false, count: 0, total: 0 };
  const counts = new Map();
  for (const v of clean) counts.set(v, (counts.get(v) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return { value: null, tie: true, count: sorted[0][1], total: clean.length };
  }
  return { value: sorted[0][0], tie: false, count: sorted[0][1], total: clean.length };
}

export function runProbe(projectRoot, probe) {
  if (!probe || typeof probe !== "object") return { value: null, source: "" };
  const re = compile(probe.pattern);
  if (!re) return { value: null, source: probe.file || probe.glob || "" };

  if (probe.file) {
    const p = join(projectRoot, probe.file);
    if (!existsSync(p)) return { value: null, source: probe.file };
    let content;
    try { content = readFileSync(p, "utf-8"); } catch { return { value: null, source: probe.file }; }
    return { value: firstGroup(content, re), source: probe.file };
  }

  if (probe.glob) {
    const files = [];
    walk(projectRoot, "", files, 0);
    const gre = globToRe(probe.glob);
    const matched = files.filter((f) => gre.test(f.split(sep).join("/")));
    const values = [];
    for (const f of matched) {
      try { values.push(firstGroup(readFileSync(join(projectRoot, f), "utf-8"), re)); }
      catch { /* arquivo ilegível é ausência de sinal, não erro */ }
    }
    const agg = probe.aggregate === "majority"
      ? aggregateMajority(values)
      : { value: values.find(Boolean) || null, tie: false, count: 0, total: 0 };
    return {
      value: agg.tie ? null : agg.value,
      // VENCEDOR/total — nunca total/total (achado A2 da fase R).
      source: probe.aggregate === "majority"
        ? `${probe.glob} (${agg.count}/${agg.total})`
        : `${probe.glob} (${matched.length} arquivos)`,
      tie: agg.tie,
    };
  }

  return { value: null, source: "" };
}

export function classifyConfidence(evidence) {
  const values = (evidence || []).map((e) => e && e.value).filter(Boolean);
  if (values.length === 0) return CONFIDENCE.UNKNOWN;
  const distinct = new Set(values);
  if (distinct.size > 1) return CONFIDENCE.AMBIGUOUS;
  return values.length >= 2 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM;
}
