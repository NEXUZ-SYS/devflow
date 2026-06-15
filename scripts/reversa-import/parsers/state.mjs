// scripts/reversa-import/parsers/state.mjs
// Parser tolerante de .reversa/state.json → fragmento IR.project.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function parseState(sourceDir) {
  let s = {};
  try { s = JSON.parse(readFileSync(join(sourceDir, ".reversa", "state.json"), "utf-8")); }
  catch { /* ausente/ilegível: degrada graciosamente */ }
  return {
    name: s.project ?? null,
    language: s.doc_language ?? s.chat_language ?? null,
    sourceType: s.project_type ?? null,
    target: s.target ?? null,
    declaredPhase: s.phase ?? null,
  };
}
