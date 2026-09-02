// routines-seed — acrescenta ao projeto as routines do template que ele ainda
// não tem, por id.
//
// O §4.6 da skill `config` fazia `[ -f .context/routines.json ] || cp ...`:
// não-destrutivo, mas com o efeito de que um projeto JÁ configurado nunca
// recebe uma routine nova. Sem isto, o checkup diário funcionaria apenas no
// repositório do próprio plugin e não alcançaria nenhum projeto-cliente.
//
// Nunca altera uma routine existente: o usuário pode ter editado descrição,
// cadência ou desabilitado, e essa escolha é dele.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

export function seedRoutines(cwd, templatePath) {
  const target = join(cwd, ".context", "routines.json");
  const tpl = readJson(templatePath, null);
  // Template ilegível não pode destruir o arquivo do projeto.
  if (!tpl || !Array.isArray(tpl.routines)) return { added: [], kept: [] };

  const current = existsSync(target) ? readJson(target, { routines: [] }) : { routines: [] };
  const routines = Array.isArray(current.routines) ? current.routines : [];
  const have = new Set(routines.map(r => r?.id).filter(Boolean));

  const added = [];
  for (const r of tpl.routines) {
    if (!r?.id || have.has(r.id)) continue;
    routines.push(r);
    added.push(r.id);
  }
  if (added.length || !existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify({ routines }, null, 2) + "\n");
  }
  return { added, kept: [...have] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , cwd, tpl] = process.argv;
  process.stdout.write(JSON.stringify(seedRoutines(cwd || process.cwd(), tpl)) + "\n");
}
