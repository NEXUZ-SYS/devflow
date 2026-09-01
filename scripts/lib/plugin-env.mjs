// plugin-env — leitor puro do ambiente de plugins do Claude Code.
//
// Só leitura de arquivo: sem rede, sem exec, sem processo filho. Quando
// ~/.claude/plugins não existe (omp, OpenCode, CI, container) devolve harness
// "other" — os checks derivados dão SKIP em vez de afirmar OK sobre um
// ambiente que não conseguem inspecionar.
//
// Instalação e habilitação são EIXOS INDEPENDENTES. Um plugin pode estar
// instalado em escopo user e habilitado apenas por projeto — é o desenho do
// PR #97, e é o estado real deste repositório. Por isso não existe "a
// instalação deste projeto": procurar a entrada cujo projectPath é o cwd
// modelaria errado a realidade e produziria FAIL falso.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseVersion } from "./version-guard.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// Extrai APENAS enabledPlugins. O settings do usuário também carrega env e
// permissions; nada além do necessário entra em memória.
function readEnabledPlugins(path) {
  const raw = readJson(path);
  const out = {};
  for (const [key, on] of Object.entries(raw?.enabledPlugins || {})) {
    if (on === true) out[key] = true;
  }
  return out;
}

// A "versão publicada" existe de três formas distintas nos marketplaces reais,
// e só a primeira é óbvia:
//   1. version no próprio marketplace.json          (NEXUZ-SYS/devflow)
//   2. source como path local -> plugin.json dentro (understand-anything)
//   3. source {url, sha} apontando repo de terceiro (superpowers)
// As três se resolvem sem rede. No caso 3 não há versão, só o sha: ele prova
// DIVERGÊNCIA, nunca qual lado é mais novo.
function readPublished(pluginsDir, mkt) {
  const mktDir = join(pluginsDir, "marketplaces", mkt);
  const manifest = readJson(join(mktDir, ".claude-plugin", "marketplace.json"));
  const out = {};
  for (const p of manifest?.plugins || []) {
    if (!p?.name) continue;

    if (p.version) {
      out[p.name] = { kind: "version", value: p.version };
      continue;
    }
    const src = p.source;
    if (typeof src === "string" && src.startsWith("./")) {
      const inner = readJson(join(mktDir, src, ".claude-plugin", "plugin.json"));
      if (inner?.version) {
        out[p.name] = { kind: "version", value: inner.version };
        continue;
      }
    }
    if (src && typeof src === "object" && src.sha) {
      out[p.name] = { kind: "sha", value: src.sha };
    }
  }
  return out;
}

export function readPluginEnv({ cwd, home = homedir() }) {
  const empty = { harness: "other", declared: {}, enabledAtUser: {}, installs: {}, marketplaces: {} };
  const pluginsDir = join(home, ".claude", "plugins");
  if (!existsSync(pluginsDir)) return empty;

  // Eixo 1 — HABILITAÇÃO. Por projeto (versionado) e global.
  const declared = {};
  for (const key of Object.keys(readEnabledPlugins(join(cwd, ".claude", "settings.json")))) {
    const at = key.lastIndexOf("@");
    if (at <= 0) continue;
    declared[key] = { key, name: key.slice(0, at), marketplace: key.slice(at + 1) };
  }
  const enabledAtUser = readEnabledPlugins(join(home, ".claude", "settings.json"));

  // Eixo 2 — INSTALAÇÃO.
  const installsRaw = readJson(join(pluginsDir, "installed_plugins.json"))?.plugins || {};
  const installs = {};
  for (const [key, entries] of Object.entries(installsRaw)) {
    if (!Array.isArray(entries)) continue;
    installs[key] = entries.map(e => ({
      scope: e?.scope,
      projectPath: e?.projectPath,
      version: e?.version,
      gitCommitSha: e?.gitCommitSha,
    }));
  }

  const known = readJson(join(pluginsDir, "known_marketplaces.json")) || {};
  const marketplaces = {};
  for (const [mkt, meta] of Object.entries(known)) {
    marketplaces[mkt] = { lastUpdated: meta?.lastUpdated || null, published: readPublished(pluginsDir, mkt) };
  }

  return { harness: "claude-code", declared, enabledAtUser, installs, marketplaces };
}

// Instalado = existe QUALQUER entrada. Qual delas o Claude Code resolve não é
// observável a partir daqui, e não precisa ser: a pergunta é "esta máquina tem
// o plugin?", não "por qual caminho".
export function isInstalled(env, key) {
  return (env.installs[key] || []).length > 0;
}

function cmpParts(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

// Maior versão semver entre todas as entradas. Responde à pergunta prática
// "preciso atualizar?" sem depender de saber qual entrada vence. Null quando
// nenhuma versão é comparável (há plugin instalado como SHA).
export function highestInstalled(env, key) {
  let best = null;
  let bestParts = null;
  for (const e of env.installs[key] || []) {
    const parts = parseVersion(e.version);
    if (!parts) continue;
    if (!bestParts || cmpParts(parts, bestParts) > 0) {
      best = e.version;
      bestParts = parts;
    }
  }
  return best;
}
