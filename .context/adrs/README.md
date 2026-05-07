# ADRs do Projeto

> Índice gerado por `scripts/adr-update-index.mjs` — não editar à mão.
> A IA consulta este índice durante o context gathering do PREVC Planning.

## ADRs

| # | Título | Versão | Categoria | Stack | Escopo | Status | Kind | Contrato | Refines | Supersedes | Criada | Guardrails | Arquivo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 001 | Migrar save path do adr-builder de .context/docs/adrs/ para .context/adrs/ | v1.0.0 | arquitetura | universal | Organizational | Proposto | firm | — | — | — | 2026-05-06 | 5 | [001-adr-path-migration-to-context-root-v1.0.0.md](001-adr-path-migration-to-context-root-v1.0.0.md) |
| 002 | Standards em 3 camadas (Markdown + LLM rules + linter executável) | v1.0.0 | principios-codigo | universal | Organizational | Proposto | firm | — | — | — | 2026-05-06 | 6 | [002-adopt-standards-triple-layer-v1.0.0.md](002-adopt-standards-triple-layer-v1.0.0.md) |
| 003 | stacks/manifest.yaml com artisanalRef apontando para .md scraped por docs-mcp-server CLI + md2llm, lido via filesystem no PreToolUse | v1.0.0 | arquitetura | universal | Organizational | Proposto | firm | — | — | — | 2026-05-06 | 8 | [003-stack-docs-artisanal-pipeline-v1.0.0.md](003-stack-docs-artisanal-pipeline-v1.0.0.md) |
| 004 | Gramática deny-first portável entre Claude Code, Cursor, Codex, Gemini CLI, OpenCode | v1.0.0 | seguranca | universal | Organizational | Proposto | firm | — | — | — | 2026-05-06 | 6 | [004-permissions-vendor-neutral-v1.0.0.md](004-permissions-vendor-neutral-v1.0.0.md) |
