// scripts/lib/doctor.mjs
// Context-health check registry for /devflow:doctor.
//
// Each check is { id, title, severity, destructive, run(ctx) } where run returns
// { status: OK|WARN|FAIL, diagnosis, repair }. `repair` is a human-runnable
// command/instruction string (empty = nothing to do). All external I/O (PATH
// resolution, subprocess) is taken from `ctx` so checks are fully unit-testable
// and never touch real resources unless the CLI wrapper injects real impls.
//
// ctx = {
//   cwd,                       // project root
//   which(bin) -> boolean,     // is `bin` resolvable on PATH
//   exec(bin, args) -> { status, stdout, stderr },
//   today,                     // YYYY-MM-DD (for future date-aware checks)
// }

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readMcp(cwd) {
  const path = join(cwd, ".mcp.json");
  if (!existsSync(path)) return { present: false };
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return { present: false };
  }
  try {
    return { present: true, json: JSON.parse(raw), raw };
  } catch (e) {
    return { present: true, parseError: e.message, raw };
  }
}

// ── Checks ──────────────────────────────────────────────────────────

const mcpConfigValid = {
  id: "mcp-config-valid",
  title: "MCP config (.mcp.json) válido e com comandos resolvíveis",
  severity: "critical",
  destructive: false,
  run(ctx) {
    const mcp = readMcp(ctx.cwd);
    if (!mcp.present) {
      return { status: "OK", diagnosis: "Sem .mcp.json no projeto (nada a validar).", repair: "" };
    }
    if (mcp.parseError) {
      return {
        status: "FAIL",
        diagnosis: `.mcp.json não é JSON válido: ${mcp.parseError}`,
        repair: "Corrija a sintaxe JSON do .mcp.json.",
      };
    }
    const servers = mcp.json.mcpServers || {};
    // Nested mcpServers key (a real misconfiguration that silently hides servers).
    if (Object.prototype.hasOwnProperty.call(servers, "mcpServers")) {
      return {
        status: "FAIL",
        diagnosis: "Há um bloco 'mcpServers' aninhado dentro de mcpServers — os servidores internos não são registrados.",
        repair: "Mova os servidores aninhados para o nível raiz de mcpServers.",
      };
    }
    // Each stdio server's command must resolve on PATH (the python→mempalace-mcp bug).
    const unresolved = [];
    for (const [name, def] of Object.entries(servers)) {
      if (!def || typeof def !== "object") continue;
      if (def.type === "http" || def.type === "sse" || def.url) continue; // remote: no command
      const cmd = def.command;
      if (cmd && !ctx.which(cmd)) unresolved.push({ name, cmd });
    }
    if (unresolved.length) {
      const list = unresolved.map(u => `${u.name} → "${u.cmd}"`).join(", ");
      const hint = unresolved.some(u => u.cmd === "python")
        ? ' (ex.: troque "python -m mempalace.mcp_server" pelo console script "mempalace-mcp")'
        : "";
      return {
        status: "FAIL",
        diagnosis: `Comando(s) de MCP não resolvem no PATH: ${list}.`,
        repair: `Aponte o command para um executável existente no PATH${hint}.`,
      };
    }
    return { status: "OK", diagnosis: "Todos os servidores MCP estão bem configurados.", repair: "" };
  },
};

const mcpConnectivity = {
  id: "mcp-connectivity",
  title: "Servidores MCP conectados",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const mcp = readMcp(ctx.cwd);
    if (!mcp.present || mcp.parseError) {
      return { status: "OK", diagnosis: "Sem config MCP válida para checar conectividade.", repair: "" };
    }
    if (!ctx.which("claude")) {
      return { status: "OK", diagnosis: "CLI 'claude' indisponível — checagem de conectividade pulada.", repair: "" };
    }
    const res = ctx.exec("claude", ["mcp", "list"]);
    if (res.status !== 0) {
      return { status: "WARN", diagnosis: "Não foi possível listar os MCP (claude mcp list falhou).", repair: "Rode 'claude mcp list' e verifique." };
    }
    // Best-effort: look for failed/disconnected markers in the listing.
    const failed = res.stdout
      .split("\n")
      .filter(l => /fail|disconnect|✘|error/i.test(l))
      .map(l => l.trim())
      .filter(Boolean);
    if (failed.length) {
      return {
        status: "WARN",
        diagnosis: `MCP possivelmente desconectado(s):\n  ${failed.join("\n  ")}`,
        repair: "Reconecte no menu /mcp ou verifique o command/url do servidor.",
      };
    }
    return { status: "OK", diagnosis: "Servidores MCP conectados.", repair: "" };
  },
};

const mempalaceHealth = {
  id: "mempalace-health",
  title: "Saúde do MemPalace (wings órfãs, drift de índice)",
  severity: "warn",
  destructive: false,
  run(ctx) {
    if (!ctx.which("mempalace")) {
      return { status: "OK", diagnosis: "MemPalace não instalado — nada a checar.", repair: "" };
    }
    const res = ctx.exec("mempalace", ["status"]);
    const out = `${res.stdout || ""}\n${res.stderr || ""}`;
    // HNSW drift / corruption is the most serious — surfaces in status output.
    if (/quarantin|corrupt|integrity check failed|drift/i.test(out)) {
      return {
        status: "FAIL",
        diagnosis: "Índice do MemPalace com drift/corrupção (segmento em quarentena).",
        repair: "mempalace repair",
      };
    }
    // Orphan wings from tmpdir mining (repo.* pattern).
    const orphans = [...out.matchAll(/WING:\s*(repo\.[A-Za-z0-9]+)/g)].map(m => m[1]);
    if (orphans.length) {
      return {
        status: "WARN",
        diagnosis: `Wings órfãs (lixo de mineração tmp): ${orphans.join(", ")}.`,
        repair: "Remova os drawers dessas wings (via tools MCP mempalace_delete_drawer) — destrutivo, confirmar.",
      };
    }
    return { status: "OK", diagnosis: "MemPalace saudável.", repair: "" };
  },
};

const devflowConfig = {
  id: "devflow-config",
  title: "Configuração DevFlow (.context/.devflow.yaml)",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const path = join(ctx.cwd, ".context", ".devflow.yaml");
    if (!existsSync(path)) {
      return { status: "WARN", diagnosis: ".context/.devflow.yaml ausente.", repair: "Rode /devflow config." };
    }
    try {
      const raw = readFileSync(path, "utf-8");
      if (!/\bstrategy:|\bgit:/.test(raw)) {
        return { status: "WARN", diagnosis: ".devflow.yaml sem seção git/strategy.", repair: "Rode /devflow config." };
      }
    } catch {
      return { status: "WARN", diagnosis: ".devflow.yaml ilegível.", repair: "Rode /devflow config." };
    }
    return { status: "OK", diagnosis: "Configuração DevFlow presente.", repair: "" };
  },
};

const gitHooks = {
  id: "git-hooks",
  title: "Git hooks DevFlow instalados conforme configuração",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const yaml = join(ctx.cwd, ".context", ".devflow.yaml");
    if (!existsSync(yaml)) return { status: "OK", diagnosis: "Sem .devflow.yaml (nada a exigir).", repair: "" };
    let raw = "";
    try { raw = readFileSync(yaml, "utf-8"); } catch { /* ignore */ }
    const autoMineOn = /autoMine:\s*post-merge/.test(raw);
    if (autoMineOn && !existsSync(join(ctx.cwd, ".git", "hooks", "post-merge"))) {
      return {
        status: "WARN",
        diagnosis: "mempalace.autoMine: post-merge está setado, mas o hook post-merge não está instalado (auto-mine inativo).",
        repair: "/devflow:memory install-hook",
      };
    }
    return { status: "OK", diagnosis: "Hooks coerentes com a configuração.", repair: "" };
  },
};

export const CHECKS = [mcpConfigValid, mcpConnectivity, mempalaceHealth, devflowConfig, gitHooks];

export function getCheck(id) {
  return CHECKS.find(c => c.id === id);
}

const SEV_RANK = { FAIL: 0, WARN: 1, OK: 2 };

export async function runChecks(ctx, ids) {
  const selected = ids && ids.length ? CHECKS.filter(c => ids.includes(c.id)) : CHECKS;
  const results = [];
  for (const check of selected) {
    let r;
    try {
      r = await check.run(ctx);
    } catch (e) {
      r = { status: "WARN", diagnosis: `Check '${check.id}' falhou ao rodar: ${e.message}`, repair: "" };
    }
    results.push({ id: check.id, title: check.title, severity: check.severity, destructive: check.destructive, ...r });
  }
  results.sort((a, b) => SEV_RANK[a.status] - SEV_RANK[b.status]);
  return results;
}
