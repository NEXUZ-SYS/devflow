#!/usr/bin/env node
// scripts/lib/standards-hook-cli.mjs — linters pós-edição (ADR-015 D9). Falha aberto; sempre exit 0.
//
// --mode=sync : só os std que podem chegar a block; decide o bloqueio (hooks/post-tool-use-lint).
//               Saída: UM JSON (decision ou hookSpecificOutput) ou nada.
// --mode=async: os demais (warn/review); texto puro para o lembrete do hooks/post-tool-use.
//
// Lê o evento do PostToolUse no stdin. Não acrescenta conteúdo do arquivo editado a nenhuma
// mensagem: o que aparece vem só das linhas VIOLATION dos linters.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve, isAbsolute, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { checkFiles, findProjectRoot, trustedPluginRoot, loadEffectiveStandards } from "./standards-engine.mjs";
import { toRelPosix } from "./standards-baseline.mjs";
import { deriveFirstRefForStandard } from "./standard-refs.mjs";
import { inlineSafe } from "./untrusted-frame.mjs";
import { recordBlocks, STREAK_LIMIT } from "./standards-streak.mjs";

// Limite por campo de contexto injetado (o Claude Code corta em 10.000; ver global constraints).
const MAX_FIELD = 9000;
const DEFAULT_BUDGET_MS = 10000;
const MAX_BUDGET_MS = 15000; // o hook tem timeout de 20s em hooks.json

// Tudo que vem do projeto (mensagem e caminho do linter, id do std, motivo de erro) passa por
// inlineSafe: sem C0, sem bidi, sem <> — uma linha de linter não abre linha nova nem moldura.
const safe = {
  path: (v) => inlineSafe(v, 240),
  msg: (v) => inlineSafe(v, 500),
  id: (v) => inlineSafe(v, 120),
};
const loc = (f) => `${safe.path(f.path)}${f.line == null ? "" : `:${f.line}`}`;
const syncLine = (f) => `- ${safe.path(f.path)}:${f.line ?? "?"} [${safe.id(f.stdId)}/${safe.id(f.ruleId)}] ${safe.msg(f.message)}`;

// Formato que o post-tool-use async já injetava (run-linter-cli): prefixo "Standard <id>
// violated:" + a linha VIOLATION do protocolo + "std:" e "ref:" quando conhecidos.
function asyncLine(f, meta) {
  const parts = [`Standard ${safe.id(f.stdId)} violated: VIOLATION ${safe.id(f.ruleId)} ${loc(f)} ${safe.msg(f.message)}`];
  const m = meta?.[f.stdId];
  if (m?.stdPath) parts.push(`  std: ${safe.path(m.stdPath)}`);
  if (m?.ref) parts.push(`  ref: ${safe.msg(m.ref)}`);
  return parts.join("\n");
}

function clip(s, cmd) {
  if (s.length <= MAX_FIELD) return s;
  const tail = `\n… (saída truncada; lista completa com: ${cmd} check --staged)`;
  return s.slice(0, Math.max(0, MAX_FIELD - tail.length)) + tail;
}

/**
 * Decide o que o hook devolve. Pura.
 * @returns {{decision?: {decision: "block", reason: string}, context?: string}}
 */
export function renderHookResult(r, { mode, cmd, meta, stuck } = {}) {
  const fmt = mode === "async" ? (f) => asyncLine(f, meta) : syncLine;
  const list = (xs) => xs.map(fmt).join("\n");
  if (mode === "sync" && r.blocking.length && r.hasBaseline) {
    if (stuck?.length) {
      return {
        decision: {
          decision: "block",
          reason: clip(`A mesma violação bloqueou ${STREAK_LIMIT} vezes seguidas. Pare e pergunte ao humano como proceder; não tente contornar o standard:\n${list(stuck)}`, cmd),
        },
      };
    }
    return {
      decision: {
        decision: "block",
        reason: clip(`Violação nova de standard de nível block. Corrija antes de seguir:\n${list(r.blocking)}\nSe achar que é falso positivo, pare e pergunte ao humano.`, cmd),
      },
    };
  }
  const notes = [];
  if (r.baselineError) notes.push(`${inlineSafe(r.baselineError, 400)}. O hook não bloqueia até o operador corrigir o arquivo; o CI falha com exit 3.`);
  // Baseline que existe mas não pôde ser lido não é "projeto sem baseline": sugerir `baseline
  // init` ali mandaria o operador recriar por cima do que está versionado.
  if (r.blocking.length && r.baselineError) notes.push(`Standards (block) violados; sem baseline legível o hook não bloqueia:\n${list(r.blocking)}`);
  else if (r.blocking.length) notes.push(`Standards (block) violados, mas o projeto não tem baseline — o hook não bloqueia. O operador registra o legado com: ${cmd} baseline init\n${list(r.blocking)}`);
  if (r.review.length) notes.push(`Standards (review) — serão checados na fase V:\n${list(r.review)}`);
  if (r.warnings.length) notes.push(`Standards (warn):\n${list(r.warnings)}`);
  if (r.errors.length) notes.push(`Linter falhou ou estourou o orçamento (hook segue): ${r.errors.map(e => `${safe.id(e.stdId)}: ${inlineSafe(e.reason, 300)}`).join("; ")}. Rode ${cmd} check --staged antes do commit.`);
  return notes.length ? { context: clip(notes.join("\n\n"), cmd) } : {};
}

/** Payload do span OTel `devflow.standards.check`. Pura. */
export function spanPayload(r, ms, mode) {
  return {
    event: "devflow.standards.check",
    attributes: {
      "devflow.standards.mode": mode,
      "devflow.standards.duration_ms": ms,
      "devflow.standards.linters": r.blocking.length + r.warnings.length + r.review.length + r.baselined.length + r.errors.length,
      "devflow.standards.blocked": r.blocking.length,
      "devflow.standards.errors": r.errors.length,
    },
  };
}

// "std:" e "ref:" por std com achado (só no async; o síncrono não paga esse custo).
function stdMeta(root, r) {
  const ids = new Set([...r.warnings, ...r.review, ...r.blocking].map(f => f.stdId));
  if (!ids.size) return {};
  const meta = {};
  for (const std of loadEffectiveStandards(root)) {
    if (!ids.has(String(std.id)) || meta[std.id]) continue;
    const abs = std.filePath || "";
    const rel = abs ? relative(root, abs) : "";
    const stdPath = abs && rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split("\\").join("/") : abs || null;
    let ref = null;
    try {
      const x = deriveFirstRefForStandard(std, root);
      if (x?.status === "mcp-indexed") ref = `query mcp__docs-mcp-server__search_docs("${x.lib}", "<question>") (MCP-indexed)`;
      else if (x?.refPath) ref = `.context/stacks/${x.refPath}${x.status === "pending-scrape" ? " (pending-scrape)" : ""}`;
    } catch { /* ref é enriquecimento; sem ele a linha segue */ }
    meta[std.id] = { stdPath, ref };
  }
  return meta;
}

async function main() {
  const mode = process.argv.includes("--mode=async") ? "async" : "sync";
  let raw = "";
  for await (const d of process.stdin) raw += d;
  let text = "";
  try {
    const ev = JSON.parse(raw);
    if (!ev || typeof ev !== "object" || !["Edit", "Write"].includes(ev.tool_name)) return finish("");
    const file = ev.tool_input?.file_path || ev.tool_input?.path;
    if (typeof file !== "string" || !file) return finish("");
    const cwd = typeof ev.cwd === "string" && ev.cwd ? ev.cwd : process.cwd();
    const abs = isAbsolute(file) ? file : resolve(cwd, file);
    // A raiz vem SÓ do cwd da sessão (ruling da rodada 1 da T14): nunca do diretório do
    // arquivo editado — senão um arquivo num repositório vizinho faria o engine executar os
    // linters machine/ de lá. Arquivo fora da raiz → toRelPosix null → nada.
    // Async sem .context: raiz = cwd (R1 — os defaults do plugin valem em projeto sem
    // .context; sem baseline nem std local, esse modo nunca decide bloqueio).
    const root = findProjectRoot(cwd) || (mode === "async" ? resolve(cwd) : null);
    if (!root || !toRelPosix(root, abs)) return finish("");
    const budgetMs = Math.min(Number(process.env.DEVFLOW_HOOK_BUDGET_MS) || DEFAULT_BUDGET_MS, MAX_BUDGET_MS);
    const t0 = Date.now();
    const r = await checkFiles({ projectRoot: root, files: [abs], budgetMs, select: mode === "sync" ? "blockable" : "nonblockable" });
    const plugin = trustedPluginRoot();
    if (plugin && existsSync(join(root, ".context", "observability.yaml"))) {
      // stdout descartado: a saída do hook síncrono é UM JSON ou nada.
      spawnSync(process.execPath, [join(plugin, "scripts/lib/otel-cli.mjs")], {
        input: JSON.stringify(spanPayload(r, Date.now() - t0, mode)), cwd: root, stdio: ["pipe", "ignore", "ignore"], timeout: 2000,
      });
    }
    const cmd = plugin ? `node "${plugin}/scripts/devflow-standards.mjs"` : "node .context/bin/devflow-standards.mjs";
    const meta = mode === "async" ? stdMeta(root, r) : undefined;
    let stuck;
    if (mode === "sync") {
      const sessionKey = `${typeof ev.session_id === "string" ? ev.session_id : ""}:${typeof ev.agent_id === "string" && ev.agent_id ? ev.agent_id : "main"}`;
      const counts = recordBlocks(root, sessionKey, toRelPosix(root, abs), r.hasBaseline ? r.blocking : []);
      stuck = r.blocking.filter((f) => (counts.get(f.fp) || 0) >= STREAK_LIMIT);
    }
    const out = renderHookResult(r, { mode, cmd, meta, stuck });
    if (mode === "async") text = out.decision ? out.decision.reason : out.context || "";
    else if (out.decision) text = JSON.stringify(out.decision);
    else if (out.context) text = JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: out.context } });
  } catch {
    text = ""; // falha aberto: nunca quebra o hook nem emite saída parcial
  }
  return finish(text);
}

// process.exit explícito: um linter órfão (abortado pelo orçamento) não segura o hook.
function finish(text) {
  if (text) process.stdout.write(text, () => process.exit(0));
  else process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.exit(0));
}
