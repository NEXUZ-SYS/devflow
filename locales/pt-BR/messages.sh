#!/usr/bin/env bash
# DevFlow i18n — Portugues (Brasil)

# --- Session Start ---
MSG_STATUS_FULL="Full Mode ativo. Todas as funcionalidades disponíveis (agent orchestration, PREVC workflow, rehydration)."
MSG_STATUS_LITE="Lite Mode — funcionalidades limitadas."
MSG_STATUS_LITE_DETAIL="Você tem \`.context/\` mas o MCP do dotcontext não está ativo."
MSG_STATUS_LITE_RECOMMEND="**Recomendação:** Ative o Full Mode para ter agent orchestration, handoffs automáticos e rehydration."
MSG_STATUS_LITE_ACTIVATE_CLI="Para ativar: \`dotcontext mcp:install claude --local\` e reinicie a sessão."
MSG_STATUS_LITE_ACTIVATE_FULL="Para ativar: \`npm install -g @dotcontext/cli && dotcontext mcp:install claude --local\` e reinicie a sessão."
MSG_STATUS_LITE_INIT="Ou execute \`/devflow init\` para setup guiado."
MSG_STATUS_MINIMAL="Minimal Mode — apenas superpowers disponível, sem contexto de projeto."
MSG_STATUS_MINIMAL_RECOMMEND="**Recomendação:** Ative o Full Mode para aproveitar agent orchestration, workflow PREVC completo e rehydration automática."
MSG_STATUS_MINIMAL_ACTIVATE="Para ativar: execute \`/devflow init\` que configura tudo automaticamente."
MSG_SESSION_INSTRUCTION="Na primeira interação desta sessão, informe brevemente ao usuário o modo atual do DevFlow e, se não for Full Mode, recomende a ativação."

# --- Session Start: Language ---
MSG_LANGUAGE_INSTRUCTION="INSTRUÇÃO DE IDIOMA: O usuário selecionou '{lang}' como idioma preferido. A partir deste momento, TODAS as suas respostas, perguntas, explicações e interações nesta conversa DEVEM ser em {lang_name}. Isso inclui mensagens de erro, atualizações de status, sugestões e qualquer outra comunicação. Apenas código, identificadores técnicos e invocações de ferramentas permanecem no idioma original."
MSG_LANGUAGE_NOT_SET_INSTRUCTION="IDIOMA: Nenhuma preferência de idioma foi definida. Se o usuário escrever em um idioma específico, responda no mesmo idioma. Para definir uma preferência permanente, o usuário pode executar \`/devflow language\`."

# --- Post Compact ---
MSG_REHYDRATION_HEADER="REHYDRATION — Contexto foi compactado. Use o snapshot abaixo para retomar."
MSG_REHYDRATION_HANDOFF_HEADER="--- Handoff (onde parei) ---"
MSG_REHYDRATION_PLAN_HEADER="--- Plano Ativo ---"
MSG_REHYDRATION_FALLBACK_HEADER="--- Fallback: Recuperação Manual ---"
MSG_REHYDRATION_FALLBACK="Nenhum handoff ou plano foi capturado. Tente:\n1. Verificar .context/workflow/.checkpoint/handoff.md\n2. Verificar .context/plans/ para planos ativos\n3. Usar git log para entender o trabalho recente\n4. Se dotcontext MCP disponível: workflow-status() e plan({ action: \\\"getStatus\\\" })"
MSG_REHYDRATION_NO_CHECKPOINT="Nenhum checkpoint encontrado. Verifique:\n1. git log para trabalho recente\n2. .context/plans/ para planos ativos\n3. Se dotcontext MCP disponível: workflow-status()"
MSG_REHYDRATION_INSTRUCTION="Retome o trabalho de onde parou. Se o handoff acima estiver presente, use-o como guia.\nMantenha .context/workflow/.checkpoint/handoff.md atualizado conforme avançar."

# --- Pre Tool Use (Branch Protection) ---
MSG_BLOCKED_HEADER="BLOQUEADO: Você está na branch protegida '{branch}'. Não é permitido editar código do projeto diretamente nesta branch."
MSG_BLOCKED_ACTION="AÇÃO AUTOMÁTICA OBRIGATÓRIA:\nInvoque o skill devflow:git-strategy AGORA usando: Skill({ skill: \\\"devflow:git-strategy\\\" })\nO skill vai perguntar ao usuário o tipo de branch e criar o isolamento automaticamente.\nApós criar a branch, retente a edição."
MSG_BLOCKED_FILE="Arquivo bloqueado: {file_path}"
MSG_BLOCKED_NOTE="NOTA: Arquivos em .context/ (workflow, checkpoints, plans, docs, agents, skills) e docs/superpowers/ são permitidos em qualquer branch."

# --- Post Tool Use (Handoff Reminder) ---
MSG_HANDOFF_REMINDER="HANDOFF UPDATE: Atualize .context/workflow/.checkpoint/handoff.md com o estado atual:\n\n\\\`\\\`\\\`markdown\n## Current Task\n<o que está sendo feito agora>\n\n## Decisions\n- <decisões tomadas nesta sessão>\n\n## Next Steps\n- <próximo passo imediato>\n\n## Blockers\n- <bloqueios encontrados, se houver>\n\\\`\\\`\\\`\n\nMantenha conciso. Este arquivo é lido pelo PreCompact antes da compactação."
