// scripts/lib/orchestrator-templates.mjs
// Geradores de template para a integração com o Agent Orchestrator (AO). Puros.

/** Conteúdo do arquivo .ao-rules (regras injetadas em todo worker do AO). */
export function aoRulesContent() {
  return `Conduza CADA tarefa pelo trilho DevFlow: comece executando /devflow scale:SMALL com a descricao da tarefa e siga TDD (RED -> GREEN -> REFACTOR).

GUARDRAILS DE GIT (inegociaveis):
- NUNCA faca push para a branch main/master.
- NUNCA faca merge de PR.
- Trabalhe apenas na branch do seu worktree; abra PR e pare.
- Nao use --force.

Idioma: pt-BR.
`;
}

/**
 * YAML do agent-orchestrator.yaml.
 * approved-and-green fica SEMPRE auto:false (merge nunca automático).
 * ci-failed/changes-requested ficam auto:false neste plano; o Plano 4 (reactions) os ativa.
 */
export function agentOrchestratorYaml({ projectId, repo, path, port = 3000, sessionPrefix = "dev" }) {
  return `$schema: https://raw.githubusercontent.com/ComposioHQ/agent-orchestrator/main/schema/config.schema.json
port: ${port}
defaults:
  runtime: tmux
  agent: claude-code
  workspace: worktree
projects:
  ${projectId}:
    repo: ${repo}
    path: ${path}
    defaultBranch: main
    sessionPrefix: ${sessionPrefix}
    agentConfig:
      permissions: permissionless
    agentRulesFile: .ao-rules
    reactions:
      ci-failed:
        auto: false
      changes-requested:
        auto: false
      approved-and-green:
        auto: false
`;
}
