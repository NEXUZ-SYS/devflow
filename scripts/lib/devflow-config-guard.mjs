// scripts/lib/devflow-config-guard.mjs
// ADV-8/B9: impede o auto-desarme da estratégia git. Detecta quando uma edição
// de .context/.devflow.yaml ENFRAQUECE os campos de segurança git.*:
//   - branchProtection: true → false
//   - protectedBranches: encolhe (remove entradas) ou esvazia
//   - strategy: passa a 'trunk-based' (remove proteção de branch)
// Função pura + zero-dep. O gate de "branch protegida" é responsabilidade do
// chamador (CLI/hook); aqui só se compara atual vs proposto.
import { parseFrontmatter } from "./frontmatter.mjs";
import { readVerify } from "./devflow-config.mjs";

export function parseGitSection(yamlText) {
  try {
    const data = parseFrontmatter(`---\n${yamlText}\n---\n`).data || {};
    const git = data.git || {};
    let pb = git.protectedBranches;
    if (Array.isArray(pb)) { /* keep */ }
    else if (pb == null) pb = [];
    else pb = [pb];
    return { strategy: git.strategy, branchProtection: git.branchProtection, protectedBranches: pb };
  } catch {
    return { strategy: undefined, branchProtection: undefined, protectedBranches: [] };
  }
}

// Retorna a lista de enfraquecimentos (vazia = nenhum).
export function detectWeakenings(currentText, proposedText) {
  const cur = parseGitSection(currentText);
  const prop = parseGitSection(proposedText);
  const weakenings = [];

  if (cur.branchProtection !== false && prop.branchProtection === false) {
    weakenings.push("branchProtection desativada (true→false)");
  }

  const removed = cur.protectedBranches.filter(b => !prop.protectedBranches.includes(b));
  if (removed.length > 0) {
    weakenings.push(`protectedBranches reduzida (removidas: ${removed.join(", ")})`);
  }

  if (cur.strategy && cur.strategy !== "trunk-based" && prop.strategy === "trunk-based") {
    weakenings.push("git.strategy trocada para 'trunk-based' (sem proteção de branch)");
  }

  // R-C2: enfraquecimento do contrato verify:. A troca por código inline é barrada
  // porque readVerify(proposedText) LANÇA (TG1/R-C1) em -c/-e/--eval/-p/-lc/... em
  // qualquer posição do argv. Mudança de comando que permanece válida NÃO vira weakening
  // (bloquearia edições legítimas) — é o resíduo humano, item de checklist da fase R.
  let curV = { signals: {} }, propV = { signals: {} };
  try { curV = readVerify(currentText); } catch { /* atual inválido: nada a comparar */ }
  try { propV = readVerify(proposedText); }
  catch (e) { weakenings.push(`verify: proposto é inválido/inseguro (${e.message})`); }
  for (const sig of Object.keys(curV.signals)) {
    if (!(sig in propV.signals)) weakenings.push(`verify.${sig} removido (o sinal deixaria de existir)`);
  }

  return weakenings;
}

export function evaluateConfigChange(currentText, proposedText) {
  const weakenings = detectWeakenings(currentText, proposedText);
  if (weakenings.length === 0) {
    return { decision: "allow", reason: "sem enfraquecimento de git.*", weakenings };
  }
  return {
    decision: "deny",
    reason:
      `Edição de .devflow.yaml enfraquece a proteção git (${weakenings.join("; ")}). ` +
      `Auto-desarme bloqueado — a própria estratégia git não pode ser afrouxada ` +
      `autonomamente. Escale ao operador (devflow:git-strategy) para aplicar essa mudança.`,
    weakenings,
  };
}
