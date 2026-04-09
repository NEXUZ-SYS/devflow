#!/usr/bin/env bash
# DevFlow i18n — Español (España)

# --- Session Start ---
MSG_STATUS_FULL="Full Mode activo. Todas las funcionalidades disponibles (agent orchestration, PREVC workflow, rehydration)."
MSG_STATUS_LITE="Lite Mode — funcionalidades limitadas."
MSG_STATUS_LITE_DETAIL="Tienes \`.context/\` pero el MCP de dotcontext no está activo."
MSG_STATUS_LITE_RECOMMEND="**Recomendación:** Activa el Full Mode para tener agent orchestration, handoffs automáticos y rehydration."
MSG_STATUS_LITE_ACTIVATE_CLI="Para activar: \`dotcontext mcp:install claude --local\` y reinicia la sesión."
MSG_STATUS_LITE_ACTIVATE_FULL="Para activar: \`npm install -g @dotcontext/cli && dotcontext mcp:install claude --local\` y reinicia la sesión."
MSG_STATUS_LITE_INIT="O ejecuta \`/devflow init\` para setup guiado."
MSG_STATUS_MINIMAL="Minimal Mode — solo superpowers disponible, sin contexto de proyecto."
MSG_STATUS_MINIMAL_RECOMMEND="**Recomendación:** Activa el Full Mode para aprovechar agent orchestration, workflow PREVC completo y rehydration automática."
MSG_STATUS_MINIMAL_ACTIVATE="Para activar: ejecuta \`/devflow init\` que configura todo automáticamente."
MSG_SESSION_INSTRUCTION="En la primera interacción de esta sesión, informa brevemente al usuario del modo actual de DevFlow y, si no es Full Mode, recomienda la activación."

# --- Session Start: Language ---
MSG_LANGUAGE_INSTRUCTION="INSTRUCCIÓN DE IDIOMA: El usuario ha seleccionado '{lang}' como su idioma preferido. A partir de este momento, TODAS tus respuestas, preguntas, explicaciones e interacciones en esta conversación DEBEN ser en {lang_name}. Esto incluye mensajes de error, actualizaciones de estado, sugerencias y cualquier otra comunicación. Solo el código, identificadores técnicos e invocaciones de herramientas permanecen en su idioma original."
MSG_LANGUAGE_NOT_SET_INSTRUCTION="IDIOMA: No se ha definido preferencia de idioma. Si el usuario escribe en un idioma específico, responde en ese mismo idioma. Para definir una preferencia permanente, el usuario puede ejecutar \`/devflow language\`."

# --- Post Compact ---
MSG_REHYDRATION_HEADER="REHYDRATION — El contexto fue compactado. Usa el snapshot de abajo para retomar."
MSG_REHYDRATION_HANDOFF_HEADER="--- Handoff (donde lo dejé) ---"
MSG_REHYDRATION_PLAN_HEADER="--- Plan Activo ---"
MSG_REHYDRATION_FALLBACK_HEADER="--- Fallback: Recuperación Manual ---"
MSG_REHYDRATION_FALLBACK="No se capturó ningún handoff o plan. Intenta:\n1. Verificar .context/workflow/.checkpoint/handoff.md\n2. Verificar .context/plans/ para planes activos\n3. Usar git log para entender el trabajo reciente\n4. Si dotcontext MCP disponible: workflow-status() y plan({ action: \\\"getStatus\\\" })"
MSG_REHYDRATION_NO_CHECKPOINT="No se encontró checkpoint. Verifica:\n1. git log para trabajo reciente\n2. .context/plans/ para planes activos\n3. Si dotcontext MCP disponible: workflow-status()"
MSG_REHYDRATION_INSTRUCTION="Retoma el trabajo donde lo dejaste. Si el handoff de arriba está presente, úsalo como guía.\nMantén .context/workflow/.checkpoint/handoff.md actualizado conforme avances."

# --- Pre Tool Use (Branch Protection) ---
MSG_BLOCKED_HEADER="BLOQUEADO: Estás en la branch protegida '{branch}'. No está permitido editar código del proyecto directamente en esta branch."
MSG_BLOCKED_ACTION="ACCIÓN AUTOMÁTICA OBLIGATORIA:\nInvoca el skill devflow:git-strategy AHORA usando: Skill({ skill: \\\"devflow:git-strategy\\\" })\nEl skill preguntará al usuario el tipo de branch y creará el aislamiento automáticamente.\nDespués de crear la branch, reintenta la edición."
MSG_BLOCKED_FILE="Archivo bloqueado: {file_path}"
MSG_BLOCKED_NOTE="NOTA: Archivos en .context/ (workflow, checkpoints, plans, docs, agents, skills) y docs/superpowers/ están permitidos en cualquier branch."
MSG_NO_CONFIG="DevFlow no está configurado para este proyecto. Ejecuta /devflow config para definir tu estrategia git antes de editar archivos.\nEsto es necesario para que DevFlow sepa qué branches proteger y cómo gestionar tu workflow."

# --- Post Tool Use (Handoff Reminder) ---
MSG_HANDOFF_REMINDER="HANDOFF UPDATE: Actualiza .context/workflow/.checkpoint/handoff.md con el estado actual:\n\n\\\`\\\`\\\`markdown\n## Current Task\n<lo que se está haciendo ahora>\n\n## Decisions\n- <decisiones tomadas en esta sesión>\n\n## Next Steps\n- <próximo paso inmediato>\n\n## Blockers\n- <bloqueos encontrados, si los hay>\n\\\`\\\`\\\`\n\nMantenlo conciso. Este archivo es leído por PreCompact antes de la compactación."

# --- Post Tool Use (Commit & Branch Finish) ---
MSG_COMMIT_PROMPT="COMMIT PROMPT: Hay cambios sin commitear después de completar una task. Pregunta al usuario via AskUserQuestion:\nPregunta: \"¿Quieres realizar el commit de los cambios actuales?\"\nOpciones: \"Sí, commitear ahora\" / \"No, seguir trabajando\"\nSi Sí → genera mensaje convencional (invoca skill devflow:commit-message para formato), haz stage de los archivos relevantes y commitea."
MSG_COMMIT_AUTO="COMMIT AUTO: Hay cambios sin commitear después de completar una task. Commitea automáticamente:\n1. Haz stage de los archivos relevantes (no .env ni credenciales)\n2. Genera mensaje de commit convencional (formato devflow:commit-message)\n3. Commitea y reporta lo que fue commiteado."
MSG_BRANCH_FINISH_PROMPT_SUPERVISED="BRANCH FINISH: Estás en la branch de trabajo '{branch}'. Todos los cambios están commiteados. Pregunta al usuario via AskUserQuestion:\nPregunta: \"¿Quieres finalizar la branch?\"\nOpciones: \"Sí, finalizar\" / \"No, seguir trabajando\"\nSi Sí → ejecuta la pipeline de finalización SECUENCIALMENTE. Cada paso es OBLIGATORIO — NUNCA saltes pasos o ejecutes fuera de orden:\n  1. Actualización del README (si README.md existe) → pregunta antes de actualizar\n  2. Bump de versión (si scripts/bump-version.sh o package.json con version existe) → pregunta patch/minor/major\n  3. Commit de los cambios finales\n  4. Push al remoto\n  5. Merge en la branch base\n  6. Limpieza de la branch\nNO hagas merge (step 5) sin completar steps 1-4 primero. Reporta resumen al final."
MSG_BRANCH_FINISH_PROMPT_ASSISTED="BRANCH FINISH: Estás en la branch de trabajo '{branch}'. Todos los cambios están commiteados. Pregunta al usuario via AskUserQuestion:\nPregunta: \"¿Quieres finalizar la branch?\"\nOpciones: \"Sí, finalizar\" / \"No, seguir trabajando\"\nSi Sí → ejecuta la pipeline de finalización automáticamente. La secuencia es OBLIGATORIA — NUNCA saltes pasos o ejecutes fuera de orden:\n  1. Actualiza README si es necesario (reporta cambios)\n  2. Bump de versión (patch default)\n  3. Commit de los cambios finales\n  4. Push al remoto\n  5. Merge en la branch base\n  6. Limpieza de la branch\n  7. Reporta resumen completo.\nNO hagas merge (step 5) sin completar steps 1-4 primero."
MSG_BRANCH_FINISH_SKIPPED="BRANCH FINISH SKIPPED: autoFinish está desactivado en .context/.devflow.yaml. La branch '{branch}' tiene todos los cambios commiteados pero la finalización automática está desactivada. Informa al usuario que la branch está lista para finalización manual."
MSG_BRANCH_FINISH_AUTO="BRANCH FINISH AUTO: Estás en la branch de trabajo '{branch}'. Todos los cambios están commiteados. Ejecuta la pipeline de finalización automáticamente. La secuencia es OBLIGATORIA — NUNCA saltes pasos o ejecutes fuera de orden:\n  1. Actualiza README si es necesario (reporta cambios)\n  2. Bump de versión (patch default)\n  3. Commit de los cambios finales\n  4. Push al remoto\n  5. Merge en la branch base\n  6. Limpieza de la branch\n  7. Reporta resumen completo.\nNO hagas merge (step 5) sin completar steps 1-4 primero. En caso de fallo (test roto, merge conflict, push rechazado): PARA y escala al usuario."

# --- Post Update ---
MSG_UPDATE_COMPLETE="✅ Update completo!"
MSG_UPDATE_FEATURES_CONFIGURED="📋 Features ya configuradas:"
MSG_UPDATE_FEATURES_AVAILABLE="🔧 Features disponibles (no configuradas):"
MSG_UPDATE_TO_ACTIVATE="Para activar:"
MSG_UPDATE_RESTART="Reinicia Claude Code para aplicar los cambios:\n  1. Escribe /exit para cerrar esta sesión\n  2. Ejecuta 'claude' de nuevo para iniciar una nueva sesión\n  O presiona Ctrl+C y reinicia."
MSG_UPDATE_ALL_CONFIGURED="Todas las features ya están configuradas en este proyecto. Ninguna acción adicional necesaria."
