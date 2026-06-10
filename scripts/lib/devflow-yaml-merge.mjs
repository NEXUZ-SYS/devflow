// scripts/lib/devflow-yaml-merge.mjs
// Merge não-destrutivo de seções de topo no `.context/.devflow.yaml`, usado pelo
// modo "patch incremental" do devflow:config (Step 5). A garantia é cirúrgica:
// aplicar uma seção substitui/anexa SOMENTE aquela seção, preservando o
// cabeçalho-comentário e as demais seções verbatim. Não há parsing semântico de
// YAML — operamos por blocos de texto delimitados por chaves de topo (coluna 0),
// justamente para não reescrever o arquivo inteiro nem perder comentários inline.

const TOP_KEY = /^([A-Za-z_][\w-]*):/;

/** Lista as chaves de seção de topo (coluna 0), na ordem de ocorrência. */
export function topLevelKeys(yaml) {
  return String(yaml ?? "")
    .split("\n")
    .map(l => TOP_KEY.exec(l))
    .filter(Boolean)
    .map(m => m[1]);
}

// Separa o YAML em preâmbulo (tudo antes da 1ª seção — tipicamente o cabeçalho)
// e uma lista ordenada de { name, text }, com whitespace de cauda aparado.
function splitSections(yaml) {
  const lines = String(yaml ?? "").split("\n");
  const idxs = [];
  lines.forEach((l, i) => { if (TOP_KEY.test(l)) idxs.push(i); });

  const preambleText = (idxs.length ? lines.slice(0, idxs[0]) : lines).join("\n").replace(/\s+$/, "");
  const sections = [];
  for (let k = 0; k < idxs.length; k++) {
    const start = idxs[k];
    const end = k + 1 < idxs.length ? idxs[k + 1] : lines.length;
    const name = TOP_KEY.exec(lines[start])[1];
    const text = lines.slice(start, end).join("\n").replace(/\s+$/, "");
    sections.push({ name, text });
  }
  return { preambleText, sections };
}

/**
 * Substitui (se já existe) ou anexa (se ausente) a seção `name` no YAML,
 * preservando preâmbulo e demais seções. `body` deve começar com `${name}:`.
 * Retorna o YAML reconstruído com uma linha em branco entre blocos e newline final.
 */
export function mergeSection(yaml, name, body) {
  const newBody = String(body ?? "").trim();
  const firstLine = newBody.split("\n").find(l => l.trim() !== "") || "";
  if (!new RegExp(`^${name}:`).test(firstLine)) {
    throw new Error(`corpo da seção '${name}' deve começar com '${name}:'`);
  }

  const { preambleText, sections } = splitSections(yaml);
  const i = sections.findIndex(s => s.name === name);
  if (i >= 0) sections[i] = { name, text: newBody };
  else sections.push({ name, text: newBody });

  const parts = [];
  if (preambleText) parts.push(preambleText);
  for (const s of sections) parts.push(s.text);
  return parts.join("\n\n") + "\n";
}
