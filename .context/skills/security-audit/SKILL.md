---
type: skill
name: Security Audit
description: Review DevFlow hooks and scripts for security — command injection, path traversal, and unsafe operations
skillSlug: security-audit
phases: [R, V]
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## When to Use

- After modifying hook scripts (bash executables)
- After modifying utility scripts in `scripts/`
- When reviewing MCP server configuration
- During Review (R) or Validation (V) phases

## Instructions

1. Review bash scripts for command injection vulnerabilities (unquoted variables, eval usage)
2. Check path handling for traversal risks (user-controlled paths without validation)
3. Verify MCP config uses pinned or latest versions (not arbitrary)
4. Check hook scripts don't leak sensitive information (env vars, tokens)
5. Validate that pre-tool-use hooks don't create bypass opportunities
6. Review `.mcp.json` for unexpected server registrations

## Examples

- Hook script using `$1` without quoting → potential command injection
- MCP config pointing to arbitrary npm package → supply chain risk
- Script writing to `/tmp` without unique naming → race condition

## Guidelines

- All bash variables must be quoted: `"$var"` not `$var`
- MCP server commands should use `npx -y` with specific package names
- Hook scripts should not store or log sensitive data
- Path operations should validate against expected directories
- Report findings as: critical (must fix), warning (should fix), info (awareness)
