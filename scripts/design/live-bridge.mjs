// scripts/design/live-bridge.mjs — bridge do modo `live` (Task F1).
// O `live` do impeccable é EXECUÇÃO DE TERCEIROS fora do TCB do DevFlow. Esta bridge é o único
// ponto de entrada e impõe, nesta ordem, gates bloqueantes antes de invocar `npx impeccable`:
//   1. hard-gate de feature branch  → recusa em branch protegida (nunca roda no tronco);
//   2. Node ≥ 24;
//   3. versão + integridade sha512 vs o pin (scripts/design/.pinned-version);
//   4. consentimento por-invocação (exibe comando+versão+hash; sem "lembrar");
//   5. só então dispara o spawn (injetável).
//
// Decisão da Revisão R (deliberada): a bridge NÃO instala nem depende de qualquer marcador de
// sessão em hook de pré-execução, e NÃO escreve marcador em disco. O gate vive INTEIRO aqui.
// Por isso este módulo não importa nenhuma primitiva de escrita de arquivo.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// ── Pin de versão/integridade ───────────────────────────────────────────────────────────────
// Lê scripts/design/.pinned-version (KEY=VALUE, comentários com #). Ausente → tudo null.
export function readPin() {
  try {
    const p = fileURLToPath(new URL("./.pinned-version", import.meta.url));
    const raw = readFileSync(p, "utf-8");
    const kv = {};
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      kv[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return {
      version: kv.PINNED_VERSION || null,
      integrity: kv.PINNED_INTEGRITY || null,
      node: kv.ENGINES_NODE || null,
    };
  } catch {
    return { version: null, integrity: null, node: null };
  }
}

function majorOf(v) {
  const m = String(v || "").match(/^(\d+)/);
  return m ? Number(m[1]) : NaN;
}

// Default: resolve o CLI local (`impeccable --version`) e a integridade publicada da versão
// resolvida (`npm view ... dist.integrity`) — verificação legítima de artefato de terceiros.
// Injetável via opts.checkCli em teste (nunca toca a rede nos testes).
function defaultCheckCli() {
  let version = null;
  try {
    const out = execFileSync("impeccable", ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    version = (out.match(/\d+\.\d+\.\d+/) || [null])[0];
  } catch {
    return { present: false, version: null, integrity: null };
  }
  let integrity = null;
  try {
    integrity = execFileSync("npm", ["view", `impeccable@${version}`, "dist.integrity"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    integrity = null;
  }
  return { present: true, version, integrity };
}

// Default: branch atual via git. Injetável via opts.currentBranch em teste.
function defaultCurrentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

// Default: branches protegidas do .context/.devflow.yaml (leitura leve por regex, sem dep de
// parser). Injetável via opts.protectedBranches em teste. Fallback conservador.
function defaultProtectedBranches() {
  const fallback = ["main", "master", "develop"];
  try {
    const raw = readFileSync(".context/.devflow.yaml", "utf-8");
    const m = raw.match(/protectedBranches:\s*\[([^\]]*)\]/);
    if (m) {
      const list = m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      if (list.length) return list;
    }
  } catch {
    /* sem arquivo/campo → fallback */
  }
  return fallback;
}

function isProtected(branch, list) {
  if (!branch) return true; // branch desconhecida → trata como protegida (fail-closed)
  if (Array.isArray(list) && list.includes(branch)) return true;
  return /^release[/-]/i.test(branch) || branch === "release";
}

// ── preflight ───────────────────────────────────────────────────────────────────────────────
// Reúne o estado dos gates SEM disparar nada. `ready` resume node24 && cliPresent && integrityOk
// && !onProtectedBranch. `reasons` lista o que impede.
export function preflight(opts = {}) {
  const pin = opts.pin || readPin();
  const reasons = [];

  const nodeVersion = opts.nodeVersion || process.versions.node;
  const node24 = majorOf(nodeVersion) >= 24;
  if (!node24) reasons.push(`Node ${nodeVersion} < 24 (o live exige Node ≥ 24).`);

  const cli = (opts.checkCli || defaultCheckCli)();
  const cliPresent = Boolean(cli && cli.present);
  const cliVersion = (cli && cli.version) || null;
  if (!cliPresent) reasons.push("CLI `impeccable` ausente (o live não auto-instala).");

  const integrityOk =
    cliPresent &&
    pin.version != null &&
    pin.integrity != null &&
    cliVersion === pin.version &&
    cli.integrity === pin.integrity;
  if (cliPresent && !integrityOk) {
    reasons.push(
      `Integridade/versão do CLI diverge do pin (esperado ${pin.version}/${pin.integrity}, ` +
      `obtido ${cliVersion}/${cli.integrity}).`,
    );
  }

  const branch = opts.currentBranch !== undefined ? opts.currentBranch : defaultCurrentBranch();
  const protectedBranches = opts.protectedBranches || defaultProtectedBranches();
  const onProtectedBranch = isProtected(branch, protectedBranches);
  if (onProtectedBranch) reasons.push(`Branch '${branch}' é protegida — o live só roda em feature branch.`);

  const ready = node24 && cliPresent && integrityOk && !onProtectedBranch;
  return { node24, cliPresent, cliVersion, integrityOk, onProtectedBranch, ready, reasons, branch };
}

// Default spawn: dispara o processo de terceiros. Injetável via opts.spawn em teste (mock).
function defaultSpawn(cmd, args) {
  return execFileSync(cmd, args, { stdio: "inherit" });
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────
// Aplica os gates em ordem e só chama o spawn com tudo verde + consentimento. Nunca dispara
// em branch protegida (hard-gate). Sem consentimento, apenas retorna o comando literal.
export function run(opts = {}) {
  const pin = opts.pin || readPin();
  const pf = preflight({ ...opts, pin });
  const pinned = pin.version || "<pinned>";
  const command = `npx impeccable@${pinned} live`;

  // 1. Hard-gate de feature branch: recusa e NÃO roda nada.
  if (pf.onProtectedBranch) {
    return {
      started: false,
      message:
        `Recusado: '${pf.branch}' é uma branch protegida. O live edita arquivos-fonte com um ` +
        `processo de terceiros e nunca roda no tronco. Crie/entre numa feature branch ` +
        `(ex.: 'git switch -c feature/<nome>') e invoque o live de novo.`,
    };
  }

  // 2/3. Runtime/integridade: no-op limpo com instrução.
  if (!pf.node24) {
    return { started: false, message: `No-op: ${pf.reasons.find((r) => /Node/.test(r)) || "Node < 24"}.` };
  }
  if (!pf.cliPresent) {
    return {
      started: false,
      message:
        `No-op: CLI \`impeccable\` ausente/offline. Para usar o live, instale-o sob consentimento ` +
        `e rode: ${command} (versão pinada ${pinned}, integridade ${pin.integrity || "n/d"}).`,
    };
  }
  if (!pf.integrityOk) {
    return {
      started: false,
      message:
        `Recusado: integridade/versão do CLI diverge do pin (esperado ${pin.version}/${pin.integrity}). ` +
        `Não execute artefato de terceiros não verificado — atualize o pin conscientemente (mudança de produto).`,
    };
  }

  // 4. Consentimento por-invocação: sem ele, só exibe o comando + versão + hash. NÃO dispara.
  if (opts.consent !== true) {
    return {
      started: false,
      message:
        `Consentimento necessário. O live executa código de TERCEIROS que edita a árvore de trabalho.\n` +
        `Comando:    ${command}\n` +
        `Versão:     ${pinned}\n` +
        `Integridade: ${pin.integrity || "n/d"}\n` +
        `Reinvoque com consentimento explícito para prosseguir.`,
    };
  }

  // 5. Tudo verde + consentimento → dispara o spawn (injetável).
  const spawn = opts.spawn || defaultSpawn;
  spawn("npx", ["-y", `impeccable@${pinned}`, "live"]);
  return { started: true, message: `Sessão live iniciada: ${command} (versão ${pinned}).` };
}

// CLI: `node scripts/design/live-bridge.mjs` → imprime o preflight (JSON). NUNCA dispara o spawn.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(preflight(), null, 2));
}
