---
type: adr
name: adr-firestore-frontend
description: Firebase Firestore Web SDK 12.x como base operacional canônica na camada Frontend
scope: organizational
source: local
stack: Firebase Firestore Web SDK 12.x
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

# ADR — Firestore Web SDK 12.x como Base Operacional Canônica no Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Firebase Firestore Web SDK 12.x
- **Categoria:** Arquitetura

---

## Contexto

Frontend Next 16 + React 19 + Tauri 2 exige leitura reativa (listeners realtime), offline-first em desktop, queries tipadas e regras de segurança server-side. Estado de domínio canônico vive em Firestore; BFF Admin SDK escreve, Frontend lê via Web SDK com Security Rules. Polling via REST acopla UI a latência e quebra UX reativa. Bundle precisa ser tree-shakable (modular API v9+) para manter LCP/INP no orçamento.

## Decisão

Adotar **Firebase Firestore Web SDK 12.x** (modular API) como base operacional do Frontend. `getFirestore`, `collection`, `doc`, `query`, `onSnapshot`, `getDocs` importados individualmente para tree-shaking. Persistência offline via `persistentLocalCache` (IndexedDB) no web shell; mesma persistência no shell Tauri. Tipos derivados de Zod schemas em `packages/contracts` via `withConverter`. Escritas SEMPRE através do BFF (Admin SDK); Frontend só lê (regra de segurança).

```
apps/web/src/shared/firebase/           → initializeApp + getFirestore singleton
apps/web/src/features/{slice}/api/      → query() + onSnapshot() + withConverter
packages/contracts/{slice}.ts           → Zod schema + FirestoreDataConverter<T>
firestore.rules                         → read: auth.uid scoped; write: deny (BFF only)
```

## Alternativas Consideradas

- **REST via fetch + polling** — sem realtime; carga de rede alta; sem offline.
- **Supabase / Postgres + Realtime** — exige migração de fonte canônica; SDK menos maduro em Tauri.
- **GraphQL subscriptions** — adiciona gateway; sem offline persistente; complexidade extra.
- **Firestore Web SDK 12.x modular** ✓ — realtime + offline + tree-shaking + rules; integração nativa com Auth e App Hosting.

## Consequências

**Positivas**
- Listeners realtime → UI reativa sem polling
- `persistentLocalCache` → offline-first em web e Tauri
- Modular API → bundle 60-80% menor que namespaced
- Security Rules → defesa em profundidade independente do BFF

**Negativas**
- Modelagem de queries acoplada a índices compostos (mitigado por CI que valida `firestore.indexes.json`)
- Sem joins → denormalização explícita
- Cobrança por reads exige `limit()`/paginação disciplinada

**Riscos aceitos**
- Latência cold-start de listener (~300ms) → skeleton UI
- Vendor lock-in → contratos em Zod isolam shape do payload

## Guardrails

- SEMPRE usar API modular (`import { getFirestore } from 'firebase/firestore'`)
- SEMPRE aplicar `withConverter<T>` derivado de Zod schema
- SEMPRE paginar com `limit()` e cursor (`startAfter`)
- NUNCA escrever do Frontend (`addDoc`/`setDoc`/`updateDoc`/`deleteDoc`) — apenas via BFF
- NUNCA importar `firebase-admin` no Frontend
- QUANDO listener for criado, ENTÃO retornar `unsubscribe` no cleanup do efeito
- QUANDO query precisar de novo índice, ENTÃO declarar em `firestore.indexes.json` no mesmo PR

## Enforcement

- [ ] Code review: rejeitar `addDoc`/`setDoc`/`updateDoc`/`deleteDoc` em `apps/web/**`
- [ ] Lint: `no-restricted-imports` bloqueia `firebase-admin` no Frontend
- [ ] Teste: emulador Firestore + Vitest valida queries e converters; Playwright cobre realtime
- [ ] Gate CI/PREVC: `firebase emulators:exec` roda regras + queries; deploy bloqueia se `firestore.rules` falhar

## Evidências / Anexos

**Fontes oficiais:** [Firebase — Cloud Firestore](https://firebase.google.com/docs/firestore) · [Firestore — Quickstart Web](https://firebase.google.com/docs/firestore/quickstart) · [Firebase JS SDK — GitHub](https://github.com/firebase/firebase-js-sdk)

```ts
// exemplo minimal — listener tipado com withConverter no Frontend
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { z } from 'zod';
import { resourceConverter } from '@nxz/contracts';

const ResourceSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string(),
  active: z.boolean(),
});

export function subscribeResources(ownerId: string, cb: (items: z.infer<typeof ResourceSchema>[]) => void) {
  const db = getFirestore();
  const q = query(
    collection(db, 'resources').withConverter(resourceConverter),
    where('ownerId', '==', ownerId),
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}
```
