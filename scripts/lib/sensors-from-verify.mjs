// sensors-from-verify.mjs — deriva o catálogo de sensores do harness a partir do
// contrato `verify:` do ADR-013, para que o gate do harness e o gate da fase V
// observem A MESMA fonte (hoje divergem e obrigam workflow-advance --force).
//
// O catálogo do harness é executado com promisify(child_process.exec) — /bin/sh -c.
// Esse caminho é do dotcontext e pré-existente; gerar o arquivo não cria a
// capacidade. A validação aqui é guard de CORRETUDE, não fronteira de segurança:
// o harness re-tokeniza a string por espaços, então um argumento com espaço
// quebraria o comando em silêncio.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { readVerifyFromPath, VERIFY_ALLOWLIST } from "./devflow-config.mjs";
import { trustedPluginRoot } from "./standards-engine.mjs";

const SHELL_META = /[;|&$`><(){}]/;
const CATALOG_REL = join(".context", "config", "sensors.json");

// Os ids que o phase-defaults do harness auto-exige. Só estes nascem bloqueantes:
// espelhar um e2e lento como bloqueante custaria minutos por avanço de fase.
const BLOCKING_IDS = new Set(["tests", "lint"]);

// `readVerify` já garante allowlist de argv[0] e ausência de código inline (ele
// lança). Aqui acrescentamos só o que é específico do round-trip argv <-> string.
export function assertShellSafe(argv, name) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error(`sensor '${name}': argv vazio`);
  }
  if (!VERIFY_ALLOWLIST.has(argv[0])) {
    throw new Error(`sensor '${name}': argv[0] '${argv[0]}' fora da allowlist`);
  }
  for (const tok of argv) {
    if (typeof tok !== "string") throw new Error(`sensor '${name}': token não-string`);
    if (SHELL_META.test(tok)) {
      throw new Error(`sensor '${name}': metacaractere de shell em '${tok}'`);
    }
    if (/\s/.test(tok)) {
      throw new Error(`sensor '${name}': espaço dentro do argumento '${tok}' quebraria o round-trip`);
    }
  }
}

// O sinal reservado não é argv do projeto (ADR-013 v1.1.0): o harness roda o verify-run do
// plugin no cwd do projeto, e ele expande o token e grava o ledger. Raiz não verificada →
// lança (o catálogo não nasce com um sensor que não roda). Caminho com espaço cai no
// assertShellSafe.
export function harnessArgv(name, argv) {
  if (name !== "standards") return argv;
  const root = trustedPluginRoot();
  if (!root) throw new Error("sensor 'standards': raiz do plugin não verificada");
  return ["node", join(root, "scripts", "lib", "verify-run.mjs"), "standards"];
}

function sensor(id, argv, description) {
  return {
    id,
    name: id,
    description,
    severity: "critical",
    blocking: BLOCKING_IDS.has(id),
    enabled: true,
    command: argv.join(" "),
  };
}

export function buildCatalog(verify) {
  const signals = (verify && verify.signals) || {};
  const sensors = [];

  for (const [name, argv] of Object.entries(signals)) {
    const a = harnessArgv(name, argv);
    assertShellSafe(a, name);
    sensors.push(sensor(name, a, `Sinal '${name}' do contrato verify: (ADR-013).`));
  }

  // O phase-defaults do harness procura o id `tests`. Espelhamos o loop rápido
  // (`unit`); sem ele, NÃO inventamos comando.
  if (Array.isArray(signals.unit)) {
    sensors.push(sensor("tests", signals.unit, "Alias do sinal 'unit' — id que o gate de fase do harness exige."));
  }

  return { version: 1, source: "manual", sensors };
}

function main(argv) {
  const write = argv[0] === "write";
  const root = (write ? argv[1] : argv[0]) || ".";
  const verify = readVerifyFromPath(join(root, ".context", ".devflow.yaml"));
  const catalog = buildCatalog(verify);
  const json = JSON.stringify(catalog, null, 2) + "\n";
  if (!write) {
    process.stdout.write(json);
    return;
  }
  const out = join(root, CATALOG_REL);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  process.stderr.write(`sensors-from-verify: ${catalog.sensors.length} sensores → ${CATALOG_REL}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
