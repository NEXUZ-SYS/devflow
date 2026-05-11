---
type: adr
name: adr-tauri-frontend
description: Tauri 2.10.x como shell desktop nativo (WebView do SO) na camada Frontend
scope: organizational
source: local
stack: Tauri 2.10.x
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-08
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Tauri 2.10.x como Shell Desktop na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Tauri
- **Categoria:** Arquitetura

## Contexto

Camada Frontend: Next.js 16 + React 19 + TypeScript 5.9 + Tailwind 4 + shadcn/ui. App único (web shell) precisa também distribuir builds desktop (Win/macOS/Linux) com footprint baixo, integração de SO (FS, notificações, tray, autoupdate) e fronteira de confiança nítida entre UI e capabilities nativas. Empacotar Chromium por target (Electron) custa ~120 MB, RAM elevada e supply chain ampla. Necessário binário compacto, IPC tipado, permission model declarativo e CI cross-platform integrado ao monorepo Turborepo.

## Decisão

Adotar **Tauri 2.10.x** como shell desktop nativo da camada Frontend. Backend host em **Rust**, frontend reutiliza o build estático do Next.js (output `export`/`standalone`). UI roda na **WebView nativa do SO** (WebView2/WKWebView/WebKitGTK). IPC via **commands tipados** + **capabilities** declaradas em `tauri.conf.json`. Autoupdate assinado, code-signing por target, instaladores via `tauri bundle`. Sem Node em runtime no cliente.

## Alternativas Consideradas

- **Electron** — maturidade alta, mas Chromium embarcado eleva binário/RAM, supply chain larga, sem permission model granular.
- **Wails v2** — Go + WebView nativa, footprint similar; ecossistema de plugins menor, sem capabilities declarativas equivalentes.
- **Neutralino / NW.js** — leves porém comunidade reduzida, ferramental de assinatura/autoupdate imaturo.
- **PWA + TWA/Capacitor** — sem acesso pleno a APIs de SO; inviável para tray, FS persistente, drivers locais.
- **Tauri 2.10.x** ✓ — binário ~10 MB, WebView do SO, IPC com permissões granulares, plugin system estável (v2), integração CI/CD ampla.

## Consequências

**Positivas**
- Binário pequeno → distribuição rápida, atualização incremental viável.
- Permission model declarativo → fronteira de confiança auditável (capabilities).
- Rust host → memória segura, FFI explícito, baixa superfície de ataque.
- Reuso 1:1 do bundle Next.js → mesmo pipeline de build/teste/lint.

**Negativas**
- Diferenças entre WebView2/WKWebView/WebKitGTK exigem matriz de testes E2E.
- Curva Rust no host (commands, async runtime, error mapping) para o time TS.
- Code-signing por target adiciona complexidade ao CI (certs, notarization).

**Riscos aceitos**
- Drift de comportamento entre WebViews → mitigado por Playwright cross-platform e feature detection.
- Acoplamento ao plugin ecosystem v2 → pinning minor + auditoria de plugins assinados.

## Guardrails

- SEMPRE declarar `capabilities` mínimas necessárias por janela em `tauri.conf.json`.
- SEMPRE expor APIs nativas via **commands** Rust tipados; tipos espelhados em TS via `specta` ou geração manual revisada.
- NUNCA habilitar `withGlobalTauri: true` em produção; usar `@tauri-apps/api` import explícito.
- NUNCA chamar `shell.open`, `fs.*` ou `http.*` sem `allowlist`/`scope` restrito.
- NUNCA embarcar segredos no bundle — Secret Manager via backend, ou prompt do SO.
- QUANDO adicionar plugin oficial, ENTÃO fixar versão minor e auditar `tauri.conf.json`.
- QUANDO publicar release, ENTÃO assinar artefatos, gerar `latest.json` e validar autoupdate em canary.

## Enforcement

- [ ] Code review: bloqueia capability `"**"`, `withGlobalTauri`, `shell.execute` sem scope.
- [ ] Lint: `clippy -- -D warnings` no host Rust; `eslint` no frontend continua.
- [ ] Build CI: `tauri build` matrix (windows-latest, macos-latest, ubuntu-latest); falha quebra pipeline.
- [ ] Teste: Playwright contra binário empacotado por SO; smoke de IPC commands.
- [ ] Gate PREVC: assinatura + notarização verificadas antes de promover release.

## Evidências / Anexos

**Fontes oficiais:**
- [Tauri 2.0 Release](https://v2.tauri.app/blog/tauri-20/)
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri Commands (IPC)](https://v2.tauri.app/develop/calling-rust/)
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub](https://github.com/tauri-apps/tauri)

```rust
// src-tauri/src/lib.rs — command tipado, fronteira explícita
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Resource { pub id: String, pub name: String }

#[tauri::command]
async fn load_resource(id: String) -> Result<Resource, String> {
    Ok(Resource { id, name: "example".into() })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_resource])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```typescript
// app/(desktop)/resource.ts — chamada IPC tipada no frontend
import { invoke } from "@tauri-apps/api/core";
import type { Resource } from "@/contracts/resource";

export const loadResource = (id: string): Promise<Resource> =>
  invoke<Resource>("load_resource", { id });
```
