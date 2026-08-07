/**
 * agent-skill-binding — grava `skills:` no frontmatter do agente de projeto.
 *
 * Materializa o vinculo declarado em `skillBindings` do profile (ADR-008
 * v1.1.0): cada papel de agente de projeto recebe a lista de skills de
 * framework que lhe cabe.
 *
 * Aditivo e idempotente: NAO re-serializa o frontmatter. Preserva o texto
 * original linha a linha e apenas insere/substitui a linha `skills:`, para que
 * as demais chaves fiquem byte-identicas por CONSTRUCAO — re-serializar poderia
 * re-emitir um campo mal-tipado (ex.: `generated:` sem aspas virando Date) e
 * fazer o parser do dotcontext descartar o frontmatter inteiro.
 *
 * NUNCA cria agente: papel sem arquivo correspondente volta em `pending` e e
 * reportado. Criar agente de projeto e competencia do dotcontext (ADR-006).
 *
 * Lib API:
 *   upsertSkillsLine(raw, slugs) -> string|null
 *   applySkillBindings({root, skillBindings}) -> {written: string[], pending: string[]}
 *
 * CLI:
 *   node agent-skill-binding.mjs --project=<root> --plugin=<root>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { frameworkContributions } from "./detect-framework.mjs";

const DELIM = /^---\s*$/;

/**
 * Insere ou substitui a linha `skills:` dentro do bloco de frontmatter.
 * Retorna null quando nao ha frontmatter ou o bloco nao fecha — nesses casos o
 * chamador trata como pendencia em vez de escrever as cegas.
 */
export function upsertSkillsLine(raw, slugs) {
  const linhas = raw.split("\n");
  if (!DELIM.test(linhas[0] ?? "")) return null;          // sem frontmatter
  const fim = linhas.findIndex((l, i) => i > 0 && DELIM.test(l));
  if (fim === -1) return null;                            // bloco nao fechado

  const valor = `skills: [${slugs.join(", ")}]`;
  const alvo = linhas.findIndex((l, i) => i > 0 && i < fim && /^skills:/.test(l));
  if (alvo === -1) linhas.splice(fim, 0, valor);          // insere antes do ---
  else linhas[alvo] = valor;                              // substitui no lugar
  return linhas.join("\n");
}

export function applySkillBindings({ root, skillBindings = {} }) {
  const written = [];
  const pending = [];

  for (const [role, slugs] of Object.entries(skillBindings)) {
    const file = join(root, ".context", "agents", `${role}.md`);
    if (!existsSync(file)) { pending.push(role); continue; }

    const raw = readFileSync(file, "utf-8");
    const { data } = parseFrontmatter(raw);
    // Frontmatter vazio = arquivo sem bloco ou ja descartado pelo parser.
    // Nao escrever por cima: reportar e deixar a decisao com o humano.
    if (!data || Object.keys(data).length === 0) { pending.push(role); continue; }

    const desejado = [...new Set(slugs)].sort();
    const atual = Array.isArray(data.skills) ? [...data.skills].sort() : null;
    if (atual && atual.join(",") === desejado.join(",")) continue;   // idempotente

    const out = upsertSkillsLine(raw, desejado);
    if (out == null) { pending.push(role); continue; }
    writeFileSync(file, out);
    written.push(role);
  }
  return { written, pending };
}

function arg(name) {
  const h = process.argv.find((a) => a.startsWith(`--${name}=`));
  return h ? h.slice(h.indexOf("=") + 1) : null;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(arg("project") || ".");
  const pluginRoot = resolve(arg("plugin") || ".");
  const { skillBindings } = frameworkContributions(root, pluginRoot);
  console.log(JSON.stringify(applySkillBindings({ root, skillBindings }), null, 2));
}
