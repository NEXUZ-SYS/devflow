// scripts/lib/knowledge-audit.mjs
// Audit determinístico de completude de um doc de conhecimento (K1–K5).
import { parseFrontmatter } from "./frontmatter.mjs";

const REQUIRED = ["type", "layer", "name", "description", "activation", "owner", "version"];
const LAYERS = ["business", "product", "operations", "engineering"];
const ACTIVATIONS = ["always", "on-demand"];

export function auditKnowledge(src, { knownRefs } = {}) {
  const failures = [];
  let data = {}, body = "";
  try {
    ({ data, body } = parseFrontmatter(src));
  } catch (e) {
    return { ok: false, failures: [`K1: frontmatter inválido — ${e.message}`] };
  }

  // K1 — frontmatter completo
  for (const k of REQUIRED) {
    if (data[k] === undefined || data[k] === "") failures.push(`K1: campo obrigatório ausente: ${k}`);
  }
  // K2 — sem placeholder de scaffold
  if (/<!--\s*TODO/i.test(body)) failures.push("K2: placeholder TODO de scaffold ainda presente");
  // K3 — activation válida
  if (data.activation && !ACTIVATIONS.includes(data.activation))
    failures.push(`K3: activation inválida: ${data.activation} (esperado: ${ACTIVATIONS.join("|")})`);
  // K4 — layer válida
  if (data.layer && !LAYERS.includes(data.layer))
    failures.push(`K4: layer inválida: ${data.layer} (esperado: ${LAYERS.join("|")})`);
  // K5 — referências @ apontam para arquivos reais (quando knownRefs fornecido)
  if (knownRefs) {
    const refs = [...body.matchAll(/@\.context\/[^\s)]+/g)].map((m) => m[0].slice(1));
    for (const ref of refs) {
      if (!knownRefs.has(ref)) failures.push(`K5: referência @ inexistente: ${ref}`);
    }
  }
  return { ok: failures.length === 0, failures };
}
