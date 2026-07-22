#!/usr/bin/env node
// context-hygiene.mjs — CLI fino sobre lib/context-hygiene.mjs.
//
// scan    → emite FATOS em JSON (artefatos + procedência da busca)
// archive → move planos entregues, com recusa mecânica do que o git não protege
//
// O julgamento "a entrega existe no código?" NÃO vive aqui: é do agente,
// sobre a evidência que este CLI observa (ADR-013).
import { pathToFileURL } from "node:url";
import { scanArtifacts, archivePaths } from "./lib/context-hygiene.mjs";

const USAGE = "uso: context-hygiene.mjs scan | archive --confirmed <path>...\n";

function main(argv) {
  const cmd = argv[0];

  if (cmd === "scan") {
    // exitCode em vez de exit(): process.exit logo após um write grande pode
    // truncar em pipe — e a skill lê justamente por pipe.
    process.stdout.write(JSON.stringify(scanArtifacts("."), null, 2) + "\n");
    process.exitCode = 0;
    return;
  }

  if (cmd === "archive") {
    const flags = argv.slice(1).filter((a) => a.startsWith("-"));
    const paths = argv.slice(1).filter((a) => !a.startsWith("-"));

    // Flag desconhecida é ERRO, nunca descartada em silêncio.
    const unknown = flags.filter((f) => f !== "--confirmed" && f !== "--json");
    if (unknown.length) {
      process.stderr.write(`archive: flag desconhecida: ${unknown.join(", ")}\n`);
      process.exitCode = 2;
      return;
    }

    // GATE MECÂNICO de consentimento. Guardrail em prosa é racionalizável por um
    // agente; este não é. Só a skill emite --confirmed, após o "sim" do operador.
    if (!flags.includes("--confirmed")) {
      process.stderr.write("archive: exige --confirmed (consentimento humano registrado pela skill)\n");
      process.exitCode = 2;
      return;
    }
    if (paths.length === 0) {
      process.stderr.write("archive: nenhum path\n");
      process.exitCode = 2;
      return;
    }

    const { moved, refused } = archivePaths(".", paths);
    // Saída estruturada como no scan — o agente lê dado, não parseia prosa.
    process.stdout.write(JSON.stringify({ moved, refused }, null, 2) + "\n");
    for (const r of refused) process.stderr.write(`refused: ${r.path} — ${r.reason}\n`);

    // Três estados distintos. Um código único para "parcial" e "nada" faria o
    // agente reprocessar os já movidos e concluir que a ferramenta quebrou.
    process.exitCode = refused.length === 0 ? 0 : moved.length > 0 ? 3 : 1;
    return;
  }

  process.stderr.write(USAGE);
  process.exitCode = 2;
}

// pathToFileURL: import.meta.url é percent-encoded e argv[1] não. Interpolar cru
// faria main() não rodar quando o path tem espaço — o CLI sairia 0 imprimindo
// nada, e a skill quebraria no JSON.parse de string vazia. O plugin é invocado
// via $CLAUDE_PLUGIN_ROOT, onde espaço no caminho é rotina em macOS/Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
