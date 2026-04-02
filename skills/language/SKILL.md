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

## Step 3: Propagate to dotcontext and superpowers

After saving the preference file, propagate the language to integrated tools:

### dotcontext MCP (if available)

The dotcontext CLI accepts `--lang <locale>` as a global flag. Update `.mcp.json` to pass the language to the MCP server:

```bash
# Read current .mcp.json and update the dotcontext args to include --lang
```

Use python3 to update the `.mcp.json`:

```python
import json

mcp_path = ".mcp.json"
with open(mcp_path) as f:
    config = json.load(f)

if "dotcontext" in config.get("mcpServers", {}):
    args = config["mcpServers"]["dotcontext"]["args"]
    # Remove existing --lang/-l flags
    new_args = []
    skip_next = False
    for i, arg in enumerate(args):
        if skip_next:
            skip_next = False
            continue
        if arg in ("--lang", "-l"):
            skip_next = True
            continue
        new_args.append(arg)
    # Add --lang before "mcp" subcommand
    mcp_idx = new_args.index("mcp") if "mcp" in new_args else len(new_args)
    new_args.insert(mcp_idx, LANGUAGE_CODE)
    new_args.insert(mcp_idx, "--lang")
    config["mcpServers"]["dotcontext"]["args"] = new_args

    with open(mcp_path, "w") as f:
        json.dump(config, f, indent=2)
```

**Map DevFlow locale codes to dotcontext locale codes:**
- `en-US` → `en`
- `pt-BR` → `pt-BR`
- `es-ES` → `es`

**Important:** After updating `.mcp.json`, inform the user that the dotcontext MCP server language will take effect on the next session restart.

### superpowers

Superpowers does not have a dedicated language configuration. However, the language instruction injected by the SessionStart hook already controls the LLM's response language, which covers all superpowers skill interactions. No additional propagation needed.

## Step 4: Confirm and switch

After saving, immediately switch your conversation language to the selected one. Confirm in the new language:

- **en-US**: "Language set to English. All DevFlow interactions will now be in English. Hook messages and dotcontext will switch on the next session."
- **pt-BR**: "Idioma definido para Português (Brasil). Todas as interações do DevFlow agora serão em português. Mensagens dos hooks e dotcontext serão traduzidas na próxima sessão."
- **es-ES**: "Idioma configurado a Español. Todas las interacciones de DevFlow ahora serán en español. Los mensajes de hooks y dotcontext se traducirán en la próxima sesión."

## Step 5: Apply immediately in conversation

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
