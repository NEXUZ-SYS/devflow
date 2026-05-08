---
type: adr
name: adr-firestore-frontend
description: Firestore Web SDK como base operacional canônica de leitura/sincronização na camada Frontend
scope: organizational
source: local
stack: Firestore Web SDK
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

# ADR — Firestore Web SDK na Camada Frontend

- **Data:** 2026-05-08
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Firestore Web SDK
- **Categoria:** Arquitetura

## Contexto

Camada Frontend: Next.js 16 + React 19 + Zustand 5 + Tauri 2. Estado canônico distribuído em Firestore (multi-tenant, multi-shell). UI exige sincronização realtime cross-device, presença, filas de leitura paginadas e suporte a offline/queued writes (Tauri desktop, edge instável). Polling via BFF gera latência alta, custo de fan-out e drift entre cliente e fonte. Camada Frontend não pode embutir Admin SDK (privilégio elevado, fronteira de confiança quebrada). Necessário SDK client-only com Auth integrado, persistência local (IndexedDB), tree-shaking modular e regras declarativas no servidor.

## Decisão

Adotar **Firestore Web SDK** (modular `firebase/firestore`) como cliente canônico de leitura e mutação no Frontend. Acesso exclusivo via API modular tree-shakeable; nunca compat-API. Auth via Firebase Auth client; ID token propagado ao BFF. Persistência IndexedDB habilitada (`persistentLocalCache`) para offline e tab-sync. Listeners (`onSnapshot`) consumidos por hooks de feature isolados; nenhum componente UI assina diretamente. Mutações sensíveis (cross-context, agregações, idempotência forte) sempre via BFF Admin SDK — Web SDK só para escritas escopadas pelo usuário autenticado e protegidas por Security Rules. Schemas validados por Zod nas bordas de leitura.

## Alternativas Consideradas

- **REST polling via BFF** — simplicidade, mas sem realtime, alto custo de fan-out, pior UX offline.
- **Supabase / PostgreSQL realtime** — relacional rico, porém migração de superfície de dados existente; sem integração com Auth/Hosting da plataforma atual.
- **Firestore via REST gRPC manual** — controle fino, sem suporte a listeners, sem cache local, custo de manutenção alto.
- **Firestore Web SDK modular** ✓ — realtime listeners, offline persistente, tree-shaking, Auth integrado, Security Rules como contrato, ergonômico em hooks React.

## Consequências

**Positivas**
- Realtime listeners → UI consistente sem polling.
- Offline-first via IndexedDB → UX resiliente em Tauri/edge instável.
- Tree-shaking modular → bundle reduzido vs. compat.
- Security Rules → fronteira declarativa entre cliente e dados.
- Tipos derivados de Zod converters → leitura tipada e validada.

**Negativas**
- Custos por leitura/listener — exige paginação e desinscrição disciplinada.
- Cold start de listeners e snapshot inicial podem inflar TTFB.
- Modelo NoSQL → joins/agregações exigem denormalização ou BFF.
- Lock-in moderado ao ecossistema Firebase (mitigado pela camada de contratos Zod).

**Riscos aceitos**
- Vazamento de leitura → Security Rules cobrem; tests obrigatórios em CI.
- Custo descontrolado de listeners → métrica `reads_per_session` no observability.

## Guardrails

- SEMPRE usar API modular (`import { collection, onSnapshot } from "firebase/firestore"`); NUNCA compat (`firebase/firestore/compat`).
- SEMPRE encapsular acesso em hook de feature (FSD); NUNCA `getDocs`/`onSnapshot` em componente UI.
- SEMPRE validar leitura com Zod via `withConverter` antes de expor à UI.
- NUNCA importar `firebase-admin` no Frontend; mutações privilegiadas vão pelo BFF.
- NUNCA expor service account credentials no client; apenas Web App config (público).
- QUANDO listener montar, ENTÃO retornar `unsubscribe` e desinscrever no cleanup do efeito.
- QUANDO criar coleção nova, ENTÃO Security Rules + emulator tests obrigatórios antes do merge.

## Enforcement

- [ ] Code review: bloqueia `firebase-admin` em `apps/web/**` e uso de compat-API.
- [ ] Lint: ESLint `no-restricted-imports` proíbe `firebase/firestore/compat` e `firebase-admin`.
- [ ] Teste: Vitest + Firestore emulator cobrem rules; Testing Library cobre hooks com mocks; Playwright cobre fluxo offline/online.
- [ ] Gate PREVC: pipeline CI roda emulator suite e falha se rules permitem leitura cross-tenant.

## Evidências / Anexos

**Fontes oficiais:**
- [Firestore Web SDK Reference](https://firebase.google.com/docs/reference/js/firestore_)
- [Firestore Modular API](https://firebase.google.com/docs/firestore/quickstart)
- [Security Rules Language](https://firebase.google.com/docs/rules/rules-language)
- [Offline Persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase JS SDK GitHub](https://github.com/firebase/firebase-js-sdk)

```ts
// apps/web/features/resources/api/use-resources.ts
"use client";
import { collection, onSnapshot, query, where, FirestoreDataConverter } from "firebase/firestore";
import { useEffect, useState } from "react";
import { z } from "zod";
import { db } from "@/shared/firebase/client";

const ResourceSchema = z.object({ id: z.string(), name: z.string(), tenantId: z.string() });
type Resource = z.infer<typeof ResourceSchema>;

const converter: FirestoreDataConverter<Resource> = {
  toFirestore: (r) => ResourceSchema.parse(r),
  fromFirestore: (snap) => ResourceSchema.parse({ id: snap.id, ...snap.data() }),
};

export function useResources(tenantId: string) {
  const [items, setItems] = useState<Resource[]>([]);
  useEffect(() => {
    const q = query(collection(db, "resources").withConverter(converter), where("tenantId", "==", tenantId));
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => d.data())));
  }, [tenantId]);
  return items;
}
```
