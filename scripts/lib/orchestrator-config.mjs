// Funções puras para configurar a integração com o Agent Orchestrator (AO).

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
