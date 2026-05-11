---
id: std-tauri
description: Tauri 2.10.x como shell desktop nativo (WebView do SO) na camada Frontend
version: 1.0.0
applyTo: ["src-tauri/**/*.rs", "src-tauri/tauri.conf.json"]
relatedAdrs: ["adr-tauri-frontend"]
enforcement:
  linter: standards/machine/std-tauri.js
weakStandardWarning: true
---
# Standard: tauri
## Princípios
Adotar **Tauri 2.10.x** como shell desktop oficial da camada Frontend. Renderer = build estático Next.js (export). Núcleo = Rust (`tauri::Builder`) expondo IPC via `#[tauri::command]` consumido por `@tauri-apps/api`. Updater Tauri 2 assinado (Ed25519) substitui canais ad-hoc. Out: lógica de domínio em Rust — Rust é apenas ponte (FS, OS, auto-update, deep-link).

```
+----------------------+        +----------------------+
| Next.js export (UI)  | <----> | tauri::invoke (IPC)  |
+----------------------+  IPC   +----------------------+
            ^                              |
            |                              v
        WebView OS                   Rust core (tauri)
```
## Anti-patterns
| Errado | Certo |
|---|---|
| importar `@tauri-apps/api` fora de `src/shared/desktop/**` (FSD layer-isolation). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| expor FS, shell ou deep-link sem capability scoped. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-tauri.js` verifica:

1. capability JSON minimal por feature; nenhum comando sem tipo serde.
2. `cargo clippy -- -D warnings` + `biome` no JS-side; regra custom proibindo `@tauri-apps/api` fora de `shared/desktop`.
3. Vitest cobre wrappers de `invoke`; Playwright executa smoke no binário desktop (Windows + macOS + Linux).
4. job `desktop-build` (3 OS) + verificação de assinatura do updater na fase V.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-tauri-frontend (`006-adr-tauri-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Tauri v2 — Calling Rust](https://v2.tauri.app/develop/calling-rust/) · [Tauri v2 — Start](https://v2.tauri.app/start/) · [Tauri Updater plugin](https://v2.tauri.app/plugin/updater/)
#[derive(Serialize)]
#[derive(Deserialize)]
#[tauri::command]
Authoring guide: `.context/standards/README.md`
