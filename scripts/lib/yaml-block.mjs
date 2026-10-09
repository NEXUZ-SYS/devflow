// scripts/lib/yaml-block.mjs — extração de bloco de topo do .devflow.yaml. PURO.
// Única implementação (ADR-011): devflow-config.mjs e models-config.mjs importam daqui.

export function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// Linhas DENTRO do bloco `<name>:` (sem valor) até a 1ª linha não-indentada não-vazia.
export function namedBlock(text, name) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp("^" + esc + ":\\s*$");
  const block = [];
  let inBlock = false;
  for (const line of normalizeNewlines(text).split("\n")) {
    if (!inBlock) {
      if (head.test(line)) inBlock = true;
      continue;
    }
    if (line.trim() !== "" && !/^\s/.test(line)) break;
    block.push(line);
  }
  return block;
}

export function dedentBlock(lines) {
  const widths = lines.filter((l) => l.trim() !== "").map((l) => l.match(/^(\s*)/)[1].length);
  const ind = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(Math.min(ind, l.length - l.trimStart().length))).join("\n");
}
