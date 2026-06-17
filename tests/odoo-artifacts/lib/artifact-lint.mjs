/**
 * Helpers puros de lint para os artefatos Odoo do plugin (3 camadas L1/L2/L3).
 * Sem I/O de processo; recebem conteúdo/paths. Consumidos por tests/odoo-artifacts/*.test.mjs.
 *
 * Critérios cobertos (spec 2026-06-17-odoo-multiversion-artifacts-review-design):
 *   1 cobertura de versão · 2 acoplamento de env · 3 separação de camadas
 *   4 integridade estrutural · 6 cross-refs · 7 front-matter
 */
import { resolve, join } from "node:path";
import { readdirSync } from "node:fs";
import { parseYaml } from "../../../scripts/lib/frontmatter.mjs";

export const REPO = resolve(import.meta.dirname, "../../..");
export const REQUIRED_VERSIONS = ["12", "13", "14", "15", "16", "17", "18"];

export const L1_FILES = {
  skills: [
    resolve(REPO, "skills/odoo-development/SKILL.md"),
    resolve(REPO, "skills/frontend-specialist-odoo/SKILL.md"),
  ],
};
export const L2_FILES = { skills: [resolve(REPO, "skills/odoo-l10n-br/SKILL.md")] };
export const L3_FILES = { skills: [resolve(REPO, "skills/odoo-nxz-overlay/SKILL.md")] };

// Standards que PERMANECEM no profile odoo (L1/L2) — devem ficar livres de NXZ.
export function l1Standards() {
  const dir = resolve(REPO, "assets/standards/profiles/odoo");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md") && f.startsWith("std-"))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

// Nomes de classe/domínio NXZ que NÃO citam o prefixo nxz_ mas são NXZ-específicos.
export const NXZ_CLASS_NAMES = ["NfceProcessor"];

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: null, body: text };
  return { data: parseYaml(m[1]), body: m[2] };
}

// Detecta versões Odoo citadas: "Odoo 12", "12.0", "| 12 |", "12→"/"12to"/"12->",
// e ranges "12-14"/"12–18"/"12 a 18" (cobre o extremo inferior/superior do range).
export function versionsCovered(text) {
  const found = new Set();
  for (const v of REQUIRED_VERSIONS) {
    const re = new RegExp(
      `(odoo\\s*${v}\\b` + // "Odoo 12"
        `|\\b${v}\\.0\\b` + // "12.0"
        `|\\|\\s*${v}\\s*\\|` + // "| 12 |"
        `|\\b${v}\\s*(?:→|–|-|->|-->|to)\\s*\\d` + // "12→13" "12-14" "15to18"
        `|\\b\\d+\\s*(?:→|–|-|->|-->|to|a)\\s*${v}\\b)`, // range terminando em v
      "i",
    );
    if (re.test(text)) found.add(v);
  }
  return found;
}

const ENV_PATTERNS = [
  /\/home\/[a-z]/i,
  /~\/Documentos/,
  /\bodoo14-migration\b/,
  /\bodoo18-nxz\b/,
  /:8069\b/,
  /compose\s+exec\b.*\bapp\b/,
  /service\s*name\s*[:=]\s*app/i,
];
export function envCouplingHits(text) {
  return ENV_PATTERNS.filter((re) => re.test(text)).map(String);
}

// Pega `nxz_*`, `nxz-*` E "nxz"/"NXZ" como palavra solta, + nomes de classe NXZ.
export function nxzHits(text) {
  const hits = (text.match(/\bnxz\b/gi) || []).concat(text.match(/\bnxz[_-][a-z0-9_]+/gi) || []);
  for (const name of NXZ_CLASS_NAMES) {
    if (new RegExp(`\\b${name}\\b`).test(text)) hits.push(name);
  }
  return hits;
}

export function l10nBrHits(text) {
  return text.match(/\bl10n_br[_a-z0-9]*/gi) || [];
}

export function sectionNumbers(body) {
  return [...body.matchAll(/^##\s+(\d+)\./gm)].map((m) => Number(m[1]));
}

// Cada `### N.M` deve herdar o N do `## N.` pai mais recente.
// Retorna lista de violações { sub, parent } onde sub.major !== parent.
export function subsectionMismatches(body) {
  const lines = body.split("\n");
  let parent = null;
  const bad = [];
  for (const line of lines) {
    const h2 = line.match(/^##\s+(\d+)\./);
    if (h2) {
      parent = Number(h2[1]);
      continue;
    }
    const h3 = line.match(/^###\s+(\d+)\.(\d+)/);
    if (h3 && parent !== null && Number(h3[1]) !== parent) {
      bad.push({ sub: `${h3[1]}.${h3[2]}`, parent });
    }
  }
  return bad;
}

export function referencedRefs(body) {
  return [...body.matchAll(/references\/([a-z0-9-]+\.md)/gi)].map((m) => m[1]);
}
