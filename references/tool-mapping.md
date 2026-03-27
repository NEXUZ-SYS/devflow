# Tool Mapping Reference

DevFlow skills use Claude Code tool names. This reference maps them to other platforms.

## Tool Equivalents

| Claude Code | Cursor | Codex | Gemini CLI | OpenCode |
|-------------|--------|-------|------------|----------|
| `Skill` | `Skill` | skill activation | `activate_skill` | skill loading |
| `Agent` (subagent) | N/A | subagent dispatch | N/A | N/A |
| `Read` | `Read` | `read_file` | `Read` | `read` |
| `Write` | `Write` | `write_file` | `Write` | `write` |
| `Edit` | `Edit` | `patch_file` | `Edit` | `edit` |
| `Bash` | `Bash` | `shell` | `Bash` | `bash` |
| `Glob` | `Glob` | `glob` | `Glob` | `glob` |
| `Grep` | `Grep` | `grep` | `Grep` | `grep` |
| `WebFetch` | `WebFetch` | `web_fetch` | `WebFetch` | N/A |
| `WebSearch` | `WebSearch` | `web_search` | `WebSearch` | N/A |
| `TaskCreate` | N/A | N/A | N/A | N/A |
| `TaskUpdate` | N/A | N/A | N/A | N/A |

## Subagent Support

| Platform | Subagent Support | Execution Strategy |
|----------|-----------------|-------------------|
| Claude Code | Yes (Agent tool) | `superpowers:subagent-driven-development` |
| Codex | Yes | `superpowers:subagent-driven-development` |
| Cursor | No | `superpowers:executing-plans` (sequential) |
| Gemini CLI | Limited | `superpowers:executing-plans` (sequential) |
| OpenCode | No | `superpowers:executing-plans` (sequential) |
| Windsurf | No | `superpowers:executing-plans` (sequential) |

## MCP Tool Availability (dotcontext)

dotcontext MCP tools are available on any platform that supports MCP servers:
- Claude Code: via `.mcp.json` or `claude mcp add`
- Cursor: via MCP server configuration
- Others: check platform documentation

## Hook Support

| Platform | Hook Type | Config File |
|----------|-----------|-------------|
| Claude Code | SessionStart | `hooks/hooks.json` |
| Cursor | SessionStart | `hooks/hooks-cursor.json` (if needed) |
| Codex | INSTALL.md | Manual setup |
| Gemini CLI | Extension | `gemini-extension.json` |
| OpenCode | Plugin | `.opencode/plugins/` |
