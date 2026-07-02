// Funções puras para configurar a integração com o Agent Orchestrator (AO).
import { readFileSync } from "node:fs";

/**
 * Detecta se `claude plugin list` reporta o plugin em --scope user.
 * Aceita múltiplas entradas (o mesmo plugin pode aparecer em vários escopos).
 */
export function parsePluginUserScope(output, pluginName) {
  if (!output || !pluginName) return false;
  let inPlugin = false;
  for (const line of output.split("\n")) {
    if (line.includes(pluginName)) { inPlugin = true; continue; }
    if (!inPlugin) continue;
    if (/Scope:\s*user/i.test(line)) return true;
    if (/Scope:\s*\S/i.test(line)) { inPlugin = false; continue; } // escopo desta entrada não é user
    if (line.includes("❯")) inPlugin = false; // próximo plugin sem ser o alvo
  }
  return false;
}

/** Gera a string YAML da seção `orchestrator:` do .devflow.yaml. */
export function orchestratorBlock(answers = {}) {
  const {
    enabled = true,
    provider = "ao",
    mode = "suggest",
    scales = ["LARGE"],
    minIndependentStories = 3,
    maxWaveWidth = 4,
  } = answers;
  if (!enabled) return "orchestrator:\n  enabled: false\n";
  return [
    "orchestrator:",
    "  enabled: true",
    `  provider: ${provider}`,
    `  mode: ${mode}`,
    "  trigger:",
    `    scales: [${scales.join(", ")}]`,
    `    minIndependentStories: ${minIndependentStories}`,
    `  maxWaveWidth: ${maxWaveWidth}`,
    "",
  ].join("\n");
}

/**
 * Heurística de ativação do AO na fase E.
 * Retorna { decision, reason }: "sequential" (fallback/desligado/fora de critério),
 * "ask" (mode=suggest e critérios batem → caller pergunta) ou "parallel" (mode=auto).
 */
export function shouldParallelize({ config, scale, independentCount, aoAvailable }) {
  const o = config && config.orchestrator;
  if (!o || o.enabled === false) return { decision: "sequential", reason: "orchestrator desabilitado" };
  if (!aoAvailable) return { decision: "sequential", reason: "AO indisponível (fallback sequencial)" };
  const scales = (o.trigger && o.trigger.scales) || ["LARGE"];
  if (!scales.includes(scale)) return { decision: "sequential", reason: `escala ${scale} fora de [${scales.join(", ")}]` };
  const min = (o.trigger && o.trigger.minIndependentStories) ?? 3;
  if (independentCount < min) return { decision: "sequential", reason: `${independentCount} stories independentes < mínimo ${min}` };
  if (o.mode === "auto") return { decision: "parallel", reason: "mode=auto e critérios atendidos" };
  return { decision: "ask", reason: "mode=suggest e critérios atendidos — confirmar com o operador" };
}

// CLI: node orchestrator-config.mjs <check-user-scope <name...> | block-disabled |
//   block-mode <mode> | should-parallelize <scale> <count> <ao>>
// `check-user-scope` lê a saída de `claude plugin list` do stdin; `should-parallelize`
// lê o config JSON do stdin. Sem `node -e` interpolado (SI-1) e sem execSync interno.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  const readStdin = () => { try { return readFileSync(0, "utf-8"); } catch { return ""; } };
  if (cmd === "check-user-scope") {
    const output = readStdin();
    const ok = args.length > 0 && args.every(name => parsePluginUserScope(output, name));
    process.stdout.write(ok ? "USER_SCOPE_OK" : "NEEDS_USER_SCOPE");
  } else if (cmd === "block-disabled") {
    process.stdout.write(orchestratorBlock({ enabled: false }));
  } else if (cmd === "block-mode") {
    process.stdout.write(orchestratorBlock({ mode: args[0] }));
  } else if (cmd === "should-parallelize") {
    let config = {};
    try { config = JSON.parse(readStdin() || "{}"); } catch { config = {}; }
    const [scale, count, ao] = args;
    const r = shouldParallelize({
      config, scale,
      independentCount: Number(count) || 0,
      aoAvailable: ao === "true" || ao === "1",
    });
    process.stdout.write(r.decision);
  }
}
