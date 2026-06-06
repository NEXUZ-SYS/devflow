// omp/lib/detect-runtime.mjs
// Probe leve do runtime corrente. Conservador: default = "claude".
// NÃO é o mecanismo de ativação — a ativação é explícita no init.
/** @param {NodeJS.ProcessEnv} [env] @returns {"omp"|"opencode"|"claude"} */
export function detectRuntime(env = process.env) {
  const keys = Object.keys(env);
  if (keys.some((k) => k.startsWith("OMP_") || k.startsWith("PI_"))) return "omp";
  if (env.OPENCODE || keys.some((k) => k.startsWith("OPENCODE_"))) return "opencode";
  return "claude";
}
