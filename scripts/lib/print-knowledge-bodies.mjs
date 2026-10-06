#!/usr/bin/env node
// scripts/lib/print-knowledge-bodies.mjs
// Stage-2 knowledge printer (CLI).
//
// Usage: node print-knowledge-bodies.mjs <projectRoot> <editedFilePath>
//
// Imprime um bloco <KNOWLEDGE_ONDEMAND> com os docs on-demand relevantes ao arquivo
// editado (heurística e teto de 3 docs em knowledge-ondemand.mjs). Não imprime nada e
// sai 0 quando não há doc relevante. O pre-tool-use não usa mais este CLI (T9: o contexto
// pré-edição vem de pre-edit-context.mjs, emoldurado); o contrato de saída fica inalterado.
//
// SI-1 compliant: invoked with arguments, no shell-interpolated `node -e`.
import { relevantOnDemandKnowledge } from "./knowledge-ondemand.mjs";

const [, , projectRoot, editedFilePath] = process.argv;
if (!projectRoot || !editedFilePath) process.exit(0);
let docs = [];
try { docs = relevantOnDemandKnowledge(projectRoot, editedFilePath); } catch { process.exit(0); }
if (docs.length === 0) process.exit(0);
process.stdout.write(`<KNOWLEDGE_ONDEMAND>\n${docs.map((d) => `### ${d.name}\n${d.body}`).join("\n\n")}\n</KNOWLEDGE_ONDEMAND>\n`);
