# Portability Audit — DevFlow → Other Editors

> Inventory of Claude-Code-specific assumptions in DevFlow as of v1.0.3, and what changes when porting to OpenCode, Cursor, or other agent-platform editors.

**Audit date**: 2026-05-07
**Source**: PR #21 (`feat/context-layer-v2`)
**Status**: pre-migration — no editor target validated yet; doc serves as migration checklist when target is chosen.

---

## TL;DR

The architecture is mostly portable already:

| Layer | Portability |
|---|---|
| **Lib** (`scripts/lib/*.mjs`) | ✅ Pure node:* — works anywhere node runs |
| **CLI** (`scripts/*.mjs`) | ✅ Self-locating via `import.meta.url` — invokable from any cwd |
| **Skills** (`skills/*/SKILL.md`) | ⚠ Markdown+frontmatter is portable; **embedded paths assume Claude Code** |
| **Hooks** (`hooks/*` + `hooks.json`) | ❌ Format and trigger semantics are Claude-Code-specific |
| **Plugin manifests** (`.claude-plugin/`, `.cursor-plugin/`) | ⚠ Already dual-maintained; format diverges per editor |

The migration cost is concentrated in **skills + hooks**. Lib + CLI need zero changes.

---

## 1. Skill files — `${CLAUDE_PLUGIN_ROOT}` references

26 occurrences across 5 SKILL.md files. Used to invoke CLI scripts that live in the plugin install directory.

| Skill | Occurrences | What it references |
|---|---:|---|
| `skills/adr-builder/SKILL.md` | 16 | `node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-{audit,update-index,evolve,chain-suggest}.mjs` + asset paths (`assets/TEMPLATE-ADR.md`, `assets/patterns-catalog.md`) |
| `skills/standards-builder/SKILL.md` | 5 | `node ${CLAUDE_PLUGIN_ROOT}/scripts/devflow-standards.mjs` |
| `skills/prevc-validation/SKILL.md` | 3 | `node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-audit.mjs` |
| `skills/adr-filter/SKILL.md` | 1 | `bash "${CLAUDE_PLUGIN_ROOT}/scripts/detect-project-stack.sh"` |
| `skills/git-strategy/SKILL.md` | 1 | reference to plugin path in prose |

**Migration**: define a portable convention (e.g., `${DEVFLOW_HOME}`) and replace mechanically. Per-editor:

| Editor | Equivalent of `CLAUDE_PLUGIN_ROOT` |
|---|---|
| Claude Code | `${CLAUDE_PLUGIN_ROOT}` (auto-set per session) |
| OpenCode | TBD — verify their plugin-install env-var convention |
| Cursor | TBD — verify their plugin-install env-var convention |

**Decision deferred** (advisor input PR #21): coining `DEVFLOW_HOME` now without a validated target editor risks re-renaming when actual convention is known. Better to migrate when porting.

---

## 2. Hooks — `hooks/` directory + `hooks.json` config format

`hooks.json` (Claude Code format):

```json
{
  "hooks": {
    "SessionStart": [...],
    "PreToolUse": [...],
    "PostToolUse": [...],
    "PreCompact": [...],
    "PostCompact": [...]
  }
}
```

Each entry has a `matcher`, `type`, `command` (with `${CLAUDE_PLUGIN_ROOT}` interpolation by Claude Code).

**What's Claude-Code-specific:**
- Trigger names (`SessionStart`, `PreToolUse`, etc.) — semantics defined by Claude Code's tool runner
- The `matcher` field syntax (regex against tool names / event types)
- `${CLAUDE_PLUGIN_ROOT}` interpolation in `command` strings
- The `hooks/run-hook.cmd` dispatcher pattern — Windows .cmd / bash dual-mode wrapper specific to Claude Code's installer

**What's portable:**
- The hook scripts themselves (`hooks/session-start`, `hooks/pre-tool-use`, etc.) — bash shell scripts that work in any shell environment
- The internal logic (mode detection, OTel hooks, i18n loading)

**Migration**:
- Each target editor has its own hook system. Map our hook scripts to their lifecycle events:
  - Claude Code SessionStart → OpenCode `on_session_start` (verify name)
  - Claude Code PreToolUse → OpenCode `pre_action` (verify)
  - etc.
- Rewrite `hooks.json` in the target editor's config format
- Replace `${CLAUDE_PLUGIN_ROOT}` interpolation with whatever the target editor uses

---

## 3. Plugin manifests — `.claude-plugin/` vs `.cursor-plugin/`

Both already exist in the repo. **Different fields**:

| Field | `.claude-plugin/plugin.json` | `.cursor-plugin/plugin.json` |
|---|---|---|
| `name` | `"devflow"` | `"devflow"` ✓ same |
| `version` | `"1.0.3"` | `"1.0.3"` ✓ auto-bumped together |
| `description` | full sentence | shortened |
| `author` | `{name: ...}` object | `"nxz"` string |
| `homepage`, `repository`, `license`, `keywords` | present | absent |
| `marketplace.json` | exists (Claude Code marketplace metadata) | absent |

**Migration considerations**:
- Auto-bumper script (`hooks/post-tool-use` or similar) syncs `version` across both — already works
- Each editor reads its own manifest; new editors get a new `.{editor}-plugin/` dir with their format
- Future: factor out shared metadata (name/version/description) to a single source, generate per-editor manifests

---

## 4. Skill discovery mechanism

Claude Code auto-discovers skills from `skills/*/SKILL.md`. Confirmed working.

**What to verify per target editor**:
- Does it scan `skills/`, or expect a different convention (e.g., `agents/`, `commands/`)?
- Does it parse SKILL.md frontmatter the same way (YAML frontmatter with `name`, `description`, `version`, `trigger_phrases`)?
- Is the frontmatter `description` used for skill activation matching (Claude Code does this), or are triggers explicit?

**Migration**: most likely a symlink or build step (`bin/build-skills-for-<editor>`).

---

## 5. Tool name references in skill prose

Search for "Bash tool", "Read tool", "Write tool", "Edit tool", "Grep tool" in SKILL.md files.

**Audit result**: zero hits in current codebase (advisor confirmed). Skills use generic verbs ("read", "execute", "edit") that work for any agent platform's tool naming convention.

**Forward-looking**: if writing new skills, prefer `read the file` over `use the Read tool`.

---

## 6. Lib + CLI portability — confirmed clean

- All scripts use `import.meta.url` + `dirname()` to self-locate. No hardcoded paths.
- Pure `node:*` imports (no third-party node modules in critical path; only `@arabold/docs-mcp-server` and `md2llm` for stack scrape, invoked via `npx`).
- Tests run as `node --test tests/validation/*.mjs` — no platform coupling.
- `--project=<path>` flag honored by every CLI that needs project context.

---

## Migration checklist (when target editor is chosen)

1. **Verify target editor's plugin-install env-var convention**. Decide: rename to `DEVFLOW_HOME` (universal) or `${TARGET_PLUGIN_ROOT}` (editor-specific).
2. **Sed-replace** the chosen var in 5 SKILL.md files (26 occurrences). Test that Claude Code still works (use shell `${X:-${CLAUDE_PLUGIN_ROOT}}` fallback if needed).
3. **Map hooks** to target editor's lifecycle events. Rewrite `hooks.json` in target's config format. Hook scripts themselves stay.
4. **Add `.{target}-plugin/`** manifest dir alongside existing `.claude-plugin/` and `.cursor-plugin/`. Auto-bumper already handles version sync.
5. **Verify skill discovery** — symlink `skills/` or build step if target uses different convention.
6. **Run smoke test in target editor**: invoke `devflow:adr-builder` from a real ADR creation request; verify all bash commands resolve correctly.
7. **CI guard**: if maintaining multi-editor support long-term, add a CI matrix that loads the plugin in each editor's headless mode.

Estimated migration effort (per editor): **2-4 hours** if hooks lifecycle maps cleanly; **1-2 days** if substantial differences exist.

---

## Anti-patterns to avoid in NEW skills

(Lessons from this audit, applied prospectively.)

- ❌ `node ${CLAUDE_PLUGIN_ROOT}/scripts/X.mjs` (editor-specific) → ✅ document the env-var convention; use `${PLUGIN_HOME}/scripts/X.mjs` once convention is set
- ❌ "use the Bash tool to ..." (Claude-Code tool name) → ✅ "execute" / "run" (generic verb)
- ❌ Hardcoded paths like `/usr/local/lib/devflow/` → ✅ env-var or self-resolution
- ❌ Editor-specific UI references ("the side panel", "the Skills tab") → ✅ describe behavior, not UI
- ❌ Hooks that rely on Claude-Code-specific event names without abstraction → ✅ keep hook script logic editor-agnostic; only the trigger config (`hooks.json`) is editor-specific

---

## References

- Advisor input on this audit: PR #21 conversation (decision: defer rename, ship doc instead)
- Existing dual-manifest pattern: `.claude-plugin/` + `.cursor-plugin/` already maintained
- Auto-bump tooling: handles cross-manifest version sync
