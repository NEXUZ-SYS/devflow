// scripts/lib/knowledge-from-type.mjs
// Scaffold de um doc de conhecimento a partir de uma entry da taxonomy-of-knowledge.

export function scaffoldKnowledge(type, { name, version = "1.0.0", description } = {}) {
  const desc = description ?? type.summary;
  const front = [
    "---",
    "type: knowledge",
    `layer: ${type.layer}`,
    `name: ${name}`,
    `description: ${desc}`,
    `activation: ${type.activation}`,
    `owner: ${type.owner}`,
    `version: ${version}`,
    "---",
    "",
  ].join("\n");
  const body = (type.sectionTemplate ?? ["## Conteúdo"])
    .map((h) => `${h}\n\n<!-- TODO: preencher -->\n`)
    .join("\n");
  return `${front}\n${body}`;
}
