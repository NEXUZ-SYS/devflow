---
id: std-firestore
description: Firebase Firestore Web SDK 12.x como base operacional canônica na camada Frontend
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-firestore-frontend"]
enforcement:
  linter: standards/machine/std-firestore.js
weakStandardWarning: true
---
# Standard: firestore
## Princípios
Adotar **Firebase Firestore Web SDK 12.x** (modular API) como base operacional do Frontend. `getFirestore`, `collection`, `doc`, `query`, `onSnapshot`, `getDocs` importados individualmente para tree-shaking. Persistência offline via `persistentLocalCache` (IndexedDB) no web shell; mesma persistência no shell Tauri. Tipos derivados de Zod schemas em `packages/contracts` via `withConverter`. Escritas SEMPRE através do BFF (Admin SDK); Frontend só lê (regra de segurança).

```
apps/web/src/shared/firebase/           → initializeApp + getFirestore singleton
apps/web/src/features/{slice}/api/      → query() + onSnapshot() + withConverter
packages/contracts/{slice}.ts           → Zod schema + FirestoreDataConverter<T>
firestore.rules                         → read: auth.uid scoped; write: deny (BFF only)
```
## Anti-patterns
| Errado | Certo |
|---|---|
| escrever do Frontend (`addDoc`/`setDoc`/`updateDoc`/`deleteDoc`) — apenas via BFF | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| importar `firebase-admin` no Frontend | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-firestore.js` verifica:

1. rejeitar `addDoc`/`setDoc`/`updateDoc`/`deleteDoc` em `apps/web/**`
2. `no-restricted-imports` bloqueia `firebase-admin` no Frontend
3. emulador Firestore + Vitest valida queries e converters; Playwright cobre realtime
4. `firebase emulators:exec` roda regras + queries; deploy bloqueia se `firestore.rules` falhar

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-firestore-frontend (`013-adr-firestore-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Firebase — Cloud Firestore](https://firebase.google.com/docs/firestore) · [Firestore — Quickstart Web](https://firebase.google.com/docs/firestore/quickstart) · [Firebase JS SDK — GitHub](https://github.com/firebase/firebase-js-sdk)
export function subscribeResources(ownerId: string, cb: (items: z.infer<typeof ResourceSchema>[]) => void) {
Authoring guide: `.context/standards/README.md`
