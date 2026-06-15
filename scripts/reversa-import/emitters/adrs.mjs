// scripts/reversa-import/emitters/adrs.mjs
// Emitter: decisões resolvidas → ADRs do PROJETO IMPORTADO (.context/engineering/adrs/).
// Frontmatter conforme schema real (scripts/adr-audit.mjs). Pendentes não viram ADR.
import { toSlug } from "../slug.mjs";

export function emitAdrs(ir, { now = "1970-01-01" } = {}) {
  const resolved = ir.decisions.filter((d) => d.status === "resolved");
  return resolved.map((d, i) => {
    const num = String(i + 1).padStart(3, "0");
    const slug = toSlug(d.title);
    const filename = `${num}-adr-${slug}-v1.0.0.md`;
    const body = [
      "---",
      "type: adr",
      `name: adr-${slug}`,
      `description: ${d.title}`,
      "scope: project",
      "source: reversa",
      "stack: universal",
      "category: arquitetura",
      "status: Aprovado",
      "version: 1.0.0",
      `created: ${now}`,
      "supersedes: []",
      "refines: []",
      "protocol_contract: null",
      "decision_kind: draft",
      `summary: "Decisão ${d.id} importada do projeto Reversa — revisar antes de tratar como firme."`,
      "---",
      "",
      `# ADR ${num} — ${d.title}`,
      "",
      "## Contexto",
      "Decisão importada do projeto Reversa (engenharia reversa do produto-alvo).",
      "",
      "## Decisão",
      d.body.trim() || "_(corpo não capturado na origem)_",
      "",
      "## Alternativas",
      "_(não capturadas na origem Reversa — preencher na revisão)_",
      "",
      "## Guardrails",
      "_(derivar na revisão humana)_",
      "",
      "## Proveniência",
      `Derivada de \`_reversa_sdd/_decisions/\` (${d.id}).`,
      "",
    ].join("\n");
    return { filename, body, provenance: d.id };
  });
}
