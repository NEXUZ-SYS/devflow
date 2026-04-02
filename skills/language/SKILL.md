---
type: skill
name: Language Selection
description: Set DevFlow language preference — all responses, hook messages, and interactions switch to the selected language
skillSlug: language
phases: []
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

# When to Use

- User runs `/devflow language`
- User asks to change the conversation language
- User asks DevFlow to speak in a specific language
- First-time setup when user wants non-English interaction

# Instructions

## Step 1: Show language menu

Display this interactive menu:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DevFlow — Language / Idioma / Idioma
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Select your preferred language:

  1. 🇺🇸  English
  2. 🇧🇷  Português (Brasil)
  3. 🇪🇸  Español

  Current: {current_language}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If the user provided the language directly (e.g., `/devflow language pt-BR` or `/devflow language português`), skip the menu and go to Step 2.

**Language code mapping:**
- `1`, `en`, `en-US`, `english`, `inglês`, `inglés` → `en-US`
- `2`, `pt`, `pt-BR`, `português`, `portugues`, `portuguese` → `pt-BR`
- `3`, `es`, `es-ES`, `español`, `espanol`, `spanish` → `es-ES`

## Step 2: Save preference

After the user selects a language, save the preference file:

**Project-level** (recommended — each project can have its own language):
```bash
echo "LANGUAGE_CODE" > .devflow-language
```

**User-level** (global fallback for all projects):
```bash
echo "LANGUAGE_CODE" > ~/.devflow-language
```

Ask the user which scope they prefer. Default to **project-level** if they don't specify.

The file contains just the language code (e.g., `pt-BR`), no other content.

## Step 3: Confirm and switch

After saving, immediately switch your conversation language to the selected one. Confirm in the new language:

- **en-US**: "Language set to English. All DevFlow interactions will now be in English. This takes full effect on the next session — hook messages will also switch."
- **pt-BR**: "Idioma definido para Português (Brasil). Todas as interações do DevFlow agora serão em português. Isso terá efeito completo na próxima sessão — mensagens dos hooks também serão traduzidas."
- **es-ES**: "Idioma configurado a Español. Todas las interacciones de DevFlow ahora serán en español. Esto tendrá efecto completo en la próxima sesión — los mensajes de los hooks también se traducirán."

## Step 4: Apply immediately in conversation

From this point forward in the current conversation, respond in the selected language. The hook messages (session-start, post-compact, etc.) will switch automatically on the next session start.

# Examples

**User runs `/devflow language`:**
→ Show the menu, wait for selection, save `.devflow-language`, confirm in new language

**User says "fale em português":**
→ Detect intent, save `pt-BR` to `.devflow-language`, confirm in Portuguese, continue in Portuguese

**User runs `/devflow language es`:**
→ Skip menu, save `es-ES`, confirm: "Idioma configurado a Español..."

# Guidelines

- The `.devflow-language` file is just a locale code string (e.g., `en-US`), one line, no whitespace
- Project-level (`.devflow-language` in project root) overrides user-level (`~/.devflow-language`)
- Supported codes: `en-US`, `pt-BR`, `es-ES` (extensible via `locales/` directory)
- After setting, the LLM must switch its own response language immediately
- Hook messages only switch on the next session (they run in bash, not in LLM context)
- Adding a new language requires creating `locales/{code}/messages.sh` — the framework picks it up automatically
