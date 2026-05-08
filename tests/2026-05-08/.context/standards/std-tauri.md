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
Adotar **Tauri 2.10.x** como shell desktop nativo da camada Frontend. Backend host em **Rust**, frontend reutiliza o build estático do Next.js (output `export`/`standalone`). UI roda na **WebView nativa do SO** (WebView2/WKWebView/WebKitGTK). IPC via **commands tipados** + **capabilities** declaradas em `tauri.conf.json`. Autoupdate assinado, code-signing por target, instaladores via `tauri bundle`. Sem Node em runtime no cliente.
## Anti-patterns
| Errado | Certo |
|---|---|
| habilitar `withGlobalTauri: true` em produção; usar `@tauri-apps/api` import explícito. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| chamar `shell.open`, `fs.*` ou `http.*` sem `allowlist`/`scope` restrito. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| embarcar segredos no bundle — Secret Manager via backend, ou prompt do SO. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-tauri.js` verifica:

1. bloqueia capability `"**"`, `withGlobalTauri`, `shell.execute` sem scope.
2. `clippy -- -D warnings` no host Rust; `eslint` no frontend continua.
3. Build CI: `tauri build` matrix (windows-latest, macos-latest, ubuntu-latest); falha quebra pipeline.
4. Playwright contra binário empacotado por SO; smoke de IPC commands.
5. Gate PREVC: assinatura + notarização verificadas antes de promover release.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-tauri-frontend (`006-adr-tauri-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Tauri 2.0 Release](https://v2.tauri.app/blog/tauri-20/)
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri Commands (IPC)](https://v2.tauri.app/develop/calling-rust/)
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub](https://github.com/tauri-apps/tauri)
#[derive(Serialize, Deserialize)]
#[tauri::command]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
        .invoke_handler(tauri::generate_handler![load_resource])
Authoring guide: `.context/standards/README.md`
