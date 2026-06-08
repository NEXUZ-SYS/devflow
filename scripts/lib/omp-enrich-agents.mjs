// Patch ADITIVO de campos omp no frontmatter, preservando campos canônicos e
// corpo. Idempotente. Rejeita valores com controle/newline (M3). CRLF-aware.
import { parseFrontmatter } from "./frontmatter.mjs";
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const BAD_VALUE = /[\x00-\x1F]/;
/** @param {string} content @param {Record<string,string>} ompFields @returns {string} */
export function enrichAgentFrontmatter(content, ompFields) {
  const m = content.match(FM_RE);
  if (!m) throw new Error("frontmatter ausente ou malformado");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = m[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(ompFields)) {
    if (BAD_VALUE.test(String(value))) throw new Error(`valor inválido para ${key}`);
    const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*.*$`);
    const idx = lines.findIndex((l) => keyRe.test(l));
    const line = `${key}: ${value}`;
    if (idx >= 0) lines[idx] = line; else lines.push(line);
  }
  const out = `---${eol}${lines.join(eol)}${eol}---${eol}${m[2]}`;
  const a = parseFrontmatter(content).data, b = parseFrontmatter(out).data;
  for (const k of ["type", "name", "status"]) {
    if (k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k])) throw new Error(`invariante violado: ${k}`);
  }
  return out;
}
