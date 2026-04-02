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

# --- Post Tool Use (Handoff Reminder) ---
MSG_HANDOFF_REMINDER="HANDOFF UPDATE: Actualiza .context/workflow/.checkpoint/handoff.md con el estado actual:\n\n\\\`\\\`\\\`markdown\n## Current Task\n<lo que se está haciendo ahora>\n\n## Decisions\n- <decisiones tomadas en esta sesión>\n\n## Next Steps\n- <próximo paso inmediato>\n\n## Blockers\n- <bloqueos encontrados, si los hay>\n\\\`\\\`\\\`\n\nMantenlo conciso. Este archivo es leído por PreCompact antes de la compactación."
