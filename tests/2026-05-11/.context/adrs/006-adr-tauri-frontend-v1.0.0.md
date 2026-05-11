---
type: adr
name: adr-tauri-frontend
description: Tauri 2.10.x como shell desktop nativo (WebView do SO) na camada Frontend
scope: organizational
source: local
stack: Tauri 2.10
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Tauri como shell desktop nativo no Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Tauri 2.10.x
- **Categoria:** Arquitetura

---

## Contexto

App Next.js 16 + React 19 entrega web e desktop a partir do mesmo bundle. Build desktop precisa de footprint enxuto, IPC tipado e auto-update assinado. Electron infla artefato (Chromium embarcado) e duplica superfície de ataque. WebView do SO é suficiente para a stack TS atual.

## Decisão

Adotar **Tauri 2.10.x** como shell desktop oficial da camada Frontend. Renderer = build estático Next.js (export). Núcleo = Rust (`tauri::Builder`) expondo IPC via `#[tauri::command]` consumido por `@tauri-apps/api`. Updater Tauri 2 assinado (Ed25519) substitui canais ad-hoc. Out: lógica de domínio em Rust — Rust é apenas ponte (FS, OS, auto-update, deep-link).

```
+----------------------+        +----------------------+
| Next.js export (UI)  | <----> | tauri::invoke (IPC)  |
+----------------------+  IPC   +----------------------+
            ^                              |
            |                              v
        WebView OS                   Rust core (tauri)
```

## Alternativas Consideradas

- **Electron** — Chromium embarcado, RAM/binário 3-5x maior, superfície de ataque ampla.
- **PWA + TWA** — sem APIs nativas (impressão térmica, USB-HID, FS confiável), updater do navegador.
- **Wails / Neutralinojs** — ecossistema imaturo, sem updater assinado equivalente.
- **Tauri 2.10.x ✓** — WebView nativo, IPC tipado, updater assinado, plugins oficiais (fs, dialog, shell, deep-link, store).

## Consequências

**Positivas**
- Binário 5-15 MB; cold start < 1s.
- IPC tipado fronteira renderer↔core, allowlist explícita por comando.
- Updater Ed25519 oficial; rollback por canal.
- Reuso integral do bundle web (FSD + Atomic mantidos).

**Negativas**
- Diferenças de WebView (WebView2 Win, WKWebView macOS, WebKitGTK Linux) exigem matriz Playwright.
- Toolchain Rust obrigatório no CI desktop (cache `~/.cargo`).

**Riscos aceitos**
- Bugs específicos WebKitGTK → fallback documentado + canary release antes do estável.

## Guardrails

- SEMPRE declarar comandos Rust com `#[tauri::command]` e tipos serde explícitos; nada de `serde_json::Value` opaco.
- SEMPRE listar capabilities em `src-tauri/capabilities/*.json` (allowlist mínima).
- NUNCA importar `@tauri-apps/api` fora de `src/shared/desktop/**` (FSD layer-isolation).
- NUNCA expor FS, shell ou deep-link sem capability scoped.
- QUANDO uma feature exigir API nativa, ENTÃO criar comando + teste Vitest mockando `invoke` + smoke Playwright no build desktop.
- QUANDO publicar release, ENTÃO assinar com chave Ed25519 em Secret Manager e validar `updater.json` no CI.

## Enforcement

- [ ] Code review: capability JSON minimal por feature; nenhum comando sem tipo serde.
- [ ] Lint: `cargo clippy -- -D warnings` + `biome` no JS-side; regra custom proibindo `@tauri-apps/api` fora de `shared/desktop`.
- [ ] Teste: Vitest cobre wrappers de `invoke`; Playwright executa smoke no binário desktop (Windows + macOS + Linux).
- [ ] Gate CI/PREVC: job `desktop-build` (3 OS) + verificação de assinatura do updater na fase V.

## Evidências / Anexos

**Fontes oficiais:** [Tauri v2 — Calling Rust](https://v2.tauri.app/develop/calling-rust/) · [Tauri v2 — Start](https://v2.tauri.app/start/) · [Tauri Updater plugin](https://v2.tauri.app/plugin/updater/)

```rust
// src-tauri/src/commands.rs — comando IPC tipado, allowlist em capabilities/*.json
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct Resource { id: String, name: String }

#[derive(Deserialize)]
pub struct ResourceQuery { id: String }

#[tauri::command]
pub async fn get_resource(q: ResourceQuery) -> Result<Resource, String> {
    Ok(Resource { id: q.id, name: "demo".into() })
}
```
