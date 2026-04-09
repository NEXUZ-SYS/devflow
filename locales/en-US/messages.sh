#!/usr/bin/env bash
# DevFlow i18n — English (US)

# --- Session Start ---
MSG_STATUS_FULL="Full Mode active. All features available (agent orchestration, PREVC workflow, rehydration)."
MSG_STATUS_LITE="Lite Mode — limited features."
MSG_STATUS_LITE_DETAIL="You have \`.context/\` but dotcontext MCP is not active."
MSG_STATUS_LITE_RECOMMEND="**Recommendation:** Enable Full Mode for agent orchestration, automatic handoffs, and rehydration."
MSG_STATUS_LITE_ACTIVATE_CLI="To activate: \`dotcontext mcp:install claude --local\` and restart the session."
MSG_STATUS_LITE_ACTIVATE_FULL="To activate: \`npm install -g @dotcontext/cli && dotcontext mcp:install claude --local\` and restart the session."
MSG_STATUS_LITE_INIT="Or run \`/devflow init\` for guided setup."
MSG_STATUS_MINIMAL="Minimal Mode — only superpowers available, no project context."
MSG_STATUS_MINIMAL_RECOMMEND="**Recommendation:** Enable Full Mode for agent orchestration, full PREVC workflow, and automatic rehydration."
MSG_STATUS_MINIMAL_ACTIVATE="To activate: run \`/devflow init\` which configures everything automatically."
MSG_SESSION_INSTRUCTION="On the first interaction of this session, briefly inform the user of the current DevFlow mode and, if not Full Mode, recommend activation."

# --- Session Start: Language ---
MSG_LANGUAGE_INSTRUCTION="LANGUAGE INSTRUCTION: The user has selected '{lang}' as their preferred language. From this point forward, ALL your responses, questions, explanations, and interactions in this conversation MUST be in {lang_name}. This includes error messages, status updates, suggestions, and any other communication. Only code, technical identifiers, and tool invocations remain in their original language."
MSG_LANGUAGE_NOT_SET_INSTRUCTION="LANGUAGE: No language preference has been set. If the user writes in a specific language, respond in that same language. To set a permanent preference, the user can run \`/devflow language\`."

# --- Post Compact ---
MSG_REHYDRATION_HEADER="REHYDRATION — Context was compacted. Use the snapshot below to resume."
MSG_REHYDRATION_HANDOFF_HEADER="--- Handoff (where I left off) ---"
MSG_REHYDRATION_PLAN_HEADER="--- Active Plan ---"
MSG_REHYDRATION_FALLBACK_HEADER="--- Fallback: Manual Recovery ---"
MSG_REHYDRATION_FALLBACK="No handoff or plan was captured. Try:\n1. Check .context/workflow/.checkpoint/handoff.md\n2. Check .context/plans/ for active plans\n3. Use git log to understand recent work\n4. If dotcontext MCP available: workflow-status() and plan({ action: \\\"getStatus\\\" })"
MSG_REHYDRATION_NO_CHECKPOINT="No checkpoint found. Check:\n1. git log for recent work\n2. .context/plans/ for active plans\n3. If dotcontext MCP available: workflow-status()"
MSG_REHYDRATION_INSTRUCTION="Resume work where you left off. If the handoff above is present, use it as a guide.\nKeep .context/workflow/.checkpoint/handoff.md updated as you progress."

# --- Pre Tool Use (Branch Protection) ---
MSG_BLOCKED_HEADER="BLOCKED: You are on protected branch '{branch}'. Editing project code directly on this branch is not allowed."
MSG_BLOCKED_ACTION="MANDATORY AUTOMATIC ACTION:\nInvoke the skill devflow:git-strategy NOW using: Skill({ skill: \\\"devflow:git-strategy\\\" })\nThe skill will ask the user the branch type and create isolation automatically.\nAfter creating the branch, retry the edit."
MSG_BLOCKED_FILE="Blocked file: {file_path}"
MSG_BLOCKED_NOTE="NOTE: Files in .context/ (workflow, checkpoints, plans, docs, agents, skills) and docs/superpowers/ are allowed on any branch."
MSG_NO_CONFIG="DevFlow is not configured for this project. Run /devflow config to set up your git strategy before editing files.\nThis is required for DevFlow to know which branches to protect and how to manage your workflow."

# --- Post Tool Use (Handoff Reminder) ---
MSG_HANDOFF_REMINDER="HANDOFF UPDATE: Update .context/workflow/.checkpoint/handoff.md with the current state:\n\n\\\`\\\`\\\`markdown\n## Current Task\n<what is being done now>\n\n## Decisions\n- <decisions made in this session>\n\n## Next Steps\n- <immediate next step>\n\n## Blockers\n- <blockers encountered, if any>\n\\\`\\\`\\\`\n\nKeep it concise. This file is read by PreCompact before compaction."

# --- Post Tool Use (Commit & Branch Finish) ---
MSG_COMMIT_PROMPT="COMMIT PROMPT: There are uncommitted changes after completing a task. Ask the user via AskUserQuestion:\nQuestion: \"Do you want to commit the current changes?\"\nOptions: \"Yes, commit now\" / \"No, keep working\"\nIf Yes → generate a conventional commit message (invoke devflow:commit-message skill for format), stage relevant files, and commit."
MSG_COMMIT_AUTO="COMMIT AUTO: There are uncommitted changes after completing a task. Commit automatically:\n1. Stage relevant files (not .env or credentials)\n2. Generate conventional commit message (devflow:commit-message format)\n3. Commit and report what was committed."
MSG_BRANCH_FINISH_PROMPT_SUPERVISED="BRANCH FINISH: You are on work branch '{branch}'. All changes are committed. Ask the user via AskUserQuestion:\nQuestion: \"Do you want to finalize the branch?\"\nOptions: \"Yes, finalize\" / \"No, keep working\"\nIf Yes → execute finalization pipeline SEQUENTIALLY. Each step is MANDATORY — NEVER skip steps or execute out of order:\n  1. README update (if README.md exists) → ask before updating\n  2. Version bump (if scripts/bump-version.sh or package.json with version exists) → ask patch/minor/major\n  3. Commit final changes\n  4. Push to remote\n  5. Merge into base branch\n  6. Cleanup branch\nDo NOT merge (step 5) without completing steps 1-4 first. Report summary at the end."
MSG_BRANCH_FINISH_PROMPT_ASSISTED="BRANCH FINISH: You are on work branch '{branch}'. All changes are committed. Ask the user via AskUserQuestion:\nQuestion: \"Do you want to finalize the branch?\"\nOptions: \"Yes, finalize\" / \"No, keep working\"\nIf Yes → execute full finalization pipeline automatically. The sequence is MANDATORY — NEVER skip steps or execute out of order:\n  1. Update README if needed (report changes)\n  2. Bump version (patch default)\n  3. Commit final changes\n  4. Push to remote\n  5. Merge into base branch\n  6. Cleanup branch\n  7. Report complete summary.\nDo NOT merge (step 5) without completing steps 1-4 first."
MSG_BRANCH_FINISH_SKIPPED="BRANCH FINISH SKIPPED: autoFinish is disabled in .context/.devflow.yaml. Branch '{branch}' has all changes committed but automatic finalization is turned off. Inform the user that the branch is ready for manual finalization."
MSG_BRANCH_FINISH_AUTO="BRANCH FINISH AUTO: You are on work branch '{branch}'. All changes are committed. Execute full finalization pipeline automatically. The sequence is MANDATORY — NEVER skip steps or execute out of order:\n  1. Update README if needed (report changes)\n  2. Bump version (patch default)\n  3. Commit final changes\n  4. Push to remote\n  5. Merge into base branch\n  6. Cleanup branch\n  7. Report complete summary.\nDo NOT merge (step 5) without completing steps 1-4 first. On any failure (test failure, merge conflict, push rejected): STOP and escalate to user."
