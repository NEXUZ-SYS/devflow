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
MSG_NO_CONFIG="DevFlow não está configurado para este projeto. Execute /devflow config para definir sua estratégia git antes de editar arquivos.\nIsso é necessário para o DevFlow saber quais branches proteger e como gerenciar seu workflow."
MSG_ASK_HEADER="CONFIRMAÇÃO: Edit/Write em '{file_path}' na branch protegida '{branch}'. Arquivo não-projeto (auto-memory / napkin) — confirme se deseja aplicar a alteração."

# --- Post Tool Use (Handoff Reminder) ---
MSG_HANDOFF_REMINDER="HANDOFF UPDATE: Atualize .context/workflow/.checkpoint/handoff.md com o estado atual:\n\n\\\`\\\`\\\`markdown\n## Current Task\n<o que está sendo feito agora>\n\n## Decisions\n- <decisões tomadas nesta sessão>\n\n## Next Steps\n- <próximo passo imediato>\n\n## Blockers\n- <bloqueios encontrados, se houver>\n\\\`\\\`\\\`\n\nMantenha conciso. Este arquivo é lido pelo PreCompact antes da compactação."

# --- Post Tool Use (Commit & Branch Finish) ---
MSG_COMMIT_PROMPT="COMMIT PROMPT: Há mudanças não commitadas após completar uma task. Pergunte ao usuário via AskUserQuestion:\nPergunta: \"Quer realizar o commit das mudanças atuais?\"\nOpções: \"Sim, commitar agora\" / \"Não, continuar trabalhando\"\nSe Sim → gere mensagem convencional (invoque skill devflow:commit-message para formato), faça stage dos arquivos relevantes e commite."
MSG_COMMIT_AUTO="COMMIT AUTO: Há mudanças não commitadas após completar uma task. Commite automaticamente:\n1. Faça stage dos arquivos relevantes (não .env ou credenciais)\n2. Gere mensagem de commit convencional (formato devflow:commit-message)\n3. Commite e reporte o que foi commitado."
MSG_BRANCH_FINISH_PROMPT_SUPERVISED="BRANCH FINISH: Você está na branch de trabalho '{branch}'. Todas as mudanças estão commitadas. Pergunte ao usuário via AskUserQuestion:\nPergunta: \"Quer finalizar a branch?\"\nOpções: \"Sim, finalizar\" / \"Não, continuar trabalhando\"\nSe Sim → execute a pipeline de finalização SEQUENCIALMENTE. Cada etapa é OBRIGATÓRIA — NUNCA pule etapas ou execute fora de ordem:\n  1. Atualização do README (se README.md existe) → pergunte antes de atualizar\n  2. Bump de versão (se scripts/bump-version.sh ou package.json com version existe) → pergunte patch/minor/major\n  3. Commit das mudanças finais\n  4. Push para o remoto\n  5. Merge na branch base\n  6. Limpeza da branch\nNÃO faça merge (step 5) sem completar steps 1-4 primeiro. Reporte resumo ao final."
MSG_BRANCH_FINISH_PROMPT_ASSISTED="BRANCH FINISH: Você está na branch de trabalho '{branch}'. Todas as mudanças estão commitadas. Pergunte ao usuário via AskUserQuestion:\nPergunta: \"Quer finalizar a branch?\"\nOpções: \"Sim, finalizar\" / \"Não, continuar trabalhando\"\nSe Sim → execute a pipeline de finalização automaticamente. A sequência é OBRIGATÓRIA — NUNCA pule etapas ou execute fora de ordem:\n  1. Atualize README se necessário (reporte mudanças)\n  2. Bump de versão (patch default)\n  3. Commit das mudanças finais\n  4. Push para o remoto\n  5. Merge na branch base\n  6. Limpeza da branch\n  7. Reporte resumo completo.\nNÃO faça merge (step 5) sem completar steps 1-4 primeiro."
MSG_BRANCH_FINISH_SKIPPED="BRANCH FINISH SKIPPED: autoFinish está desativado em .context/.devflow.yaml. A branch '{branch}' tem todas as mudanças commitadas mas a finalização automática está desligada. Informe ao usuário que a branch está pronta para finalização manual."
MSG_BRANCH_FINISH_AUTO="BRANCH FINISH AUTO: Você está na branch de trabalho '{branch}'. Todas as mudanças estão commitadas. Execute a pipeline de finalização automaticamente. A sequência é OBRIGATÓRIA — NUNCA pule etapas ou execute fora de ordem:\n  1. Atualize README se necessário (reporte mudanças)\n  2. Bump de versão (patch default)\n  3. Commit das mudanças finais\n  4. Push para o remoto\n  5. Merge na branch base\n  6. Limpeza da branch\n  7. Reporte resumo completo.\nNÃO faça merge (step 5) sem completar steps 1-4 primeiro. Em caso de falha (teste quebrado, merge conflict, push rejeitado): PARE e escale para o usuário."

# --- Post Update ---
MSG_UPDATE_COMPLETE="✅ Update completo!"
MSG_UPDATE_FEATURES_CONFIGURED="📋 Features já configuradas:"
MSG_UPDATE_FEATURES_AVAILABLE="🔧 Features disponíveis (não configuradas):"
MSG_UPDATE_TO_ACTIVATE="Para ativar:"
MSG_UPDATE_RESTART="Reinicie o Claude Code para aplicar as mudanças:\n  1. Digite /exit para fechar esta sessão\n  2. Execute 'claude' novamente para iniciar uma nova sessão\n  Ou pressione Ctrl+C e reinicie."
MSG_UPDATE_ALL_CONFIGURED="Todas as features já estão configuradas neste projeto. Nenhuma ação adicional necessária."
