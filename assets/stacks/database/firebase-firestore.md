---
title: Firebase Firestore
category: backend
edition: Native
sdks:
  client: firebase ^11
  admin: firebase-admin ^12
last_updated: 2026-05-20
status: current
upstream:
  - https://firebase.google.com/docs/firestore
  - https://github.com/firebase/firebase-admin-node
---

# Firebase Firestore

NoSQL document database serverless, multi-region replicado, com transações ACID, listeners em tempo real e vector search nativo. Parte do Firebase/GCP. Este documento foca em **Firestore como tecnologia/SDK**: capacidades, idioms de query/write, limites e integrações. Convenções de modelagem (estrutura de coleções, naming, audit fields, soft-delete) vivem em `@contracts/firebase-firestore`.

## Edição

Este projeto usa **Firestore Native** (não Datastore mode). Native é a única edição que suporta listeners em tempo real, vector search, transações leves e o conjunto completo de SDKs Firebase. Datastore mode existe para apps legados do App Engine e é incompatível com client SDKs Firebase.

## SDKs

### Client SDK (`firebase` v11)

- Usado em browsers e mobile/web.
- Respeita Security Rules — **fronteira de segurança real** quando o cliente toca Firestore diretamente.
- Suporta listeners em tempo real (`onSnapshot`) e offline persistence.
- Modular tree-shakeable (`import { getFirestore, collection, query, where } from 'firebase/firestore'`).

### Admin SDK (`firebase-admin` v12+)

- Usado em servidores: Firebase Functions, Next.js Route Handlers / Server Components.
- **Bypassa Security Rules** — toda autorização e validação fica em código de aplicação (veja `@rules/security` e `@rules/validation`).
- Suporta operações privilegiadas: `BulkWriter`, `listDocuments`, `create` (não-`set`).
- API levemente diferente do Client SDK (namespaces, sem modular imports).

### Quando usar qual

| Contexto | SDK |
|---|---|
| Next.js Server Component / Route Handler / Server Action | Admin |
| Firebase Functions | Admin |
| Client Component (`"use client"`) | Client |
| Mobile app | Client |
| Scripts de migração / backfill | Admin |

Nunca use Admin SDK em código que chega ao cliente. Nunca use Client SDK em servidor sem motivo concreto (perde performance e quebra modelo de autorização).

### REST API e gRPC

Disponíveis para integrações fora do ecossistema Firebase (ex: serviços em linguagens sem SDK oficial). Para Node.js, prefira sempre o Admin SDK.

## Modelo de dados (visão geral)

- **Documentos**: até 1 MiB cada, identificados por um path (`collection/{docId}` ou `collection/{docId}/sub/{subId}`).
- **Coleções e subcoleções**: hierarquia arbitrária; subcoleções não herdam dados do pai.
- **Tipos suportados**: `string`, `number`, `boolean`, `map`, `array`, `null`, `timestamp`, `geopoint`, `reference`, `bytes` (até 1 MiB), `vector` (até 2048 dimensões).

Convenções de naming, audit fields, soft-delete e estruturação semântica estão em `@contracts/firebase-firestore` — este documento descreve **o que o SDK permite**, não **como o time decidiu modelar**.

## Queries

### Operadores de filtro

```ts
import { collection, query, where } from 'firebase/firestore'

query(
  collection(db, 'orders'),
  where('status', '==', 'paid'),
  where('total', '>=', 100),
)
```

Operadores: `<`, `<=`, `==`, `!=`, `>`, `>=`, `in`, `not-in`, `array-contains`, `array-contains-any`.

### Ordenação, limite e cursores

```ts
query(
  collection(db, 'orders'),
  orderBy('createdAt', 'desc'),
  startAfter(lastDoc),
  limit(50),
)
```

Cursores aceitam `DocumentSnapshot` (preferível) ou valores literais. Cursor sem `orderBy` no mesmo campo produz resultado imprevisível.

### Collection group queries

```ts
import { collectionGroup, query, where } from 'firebase/firestore'

query(collectionGroup(db, 'comments'), where('authorId', '==', uid))
```

Consulta todas as subcoleções de um dado nome em qualquer profundidade. Requer índice composto se filtrar/ordenar por múltiplos campos.

### Limitação: sem OR arbitrário

Firestore suporta OR limitado via `where('field', 'in', [...])` (até 30 valores) e via `or(...)` (composições restritas com índices específicos). Para OR amplo entre campos diferentes, execute queries paralelas e faça merge no cliente — ou **re-modele os dados** (preferível; veja `@contracts/firebase-firestore`).

### Vector search (`findNearest`)

```ts
import { findNearest } from 'firebase-admin/firestore'

await db.collection('docs')
  .findNearest({
    vectorField: 'embedding',
    queryVector: [...],
    limit: 10,
    distanceMeasure: 'COSINE', // 'DOT_PRODUCT' | 'EUCLIDEAN'
  })
  .get()
```

- Embedding até 2048 dimensões.
- Requer vector index criado via `gcloud firestore indexes composite create`.
- Cada resultado conta como 1 read.
- Para dimensionalidade maior ou ANN avançado, comparar com `@stacks/database/pgvector`.
- Integração com geração de embeddings via `@stacks/ai/vercel-ai-sdk`.

### Indexes

- **Single-field**: criado automaticamente.
- **Composite**: declarado em `firestore.indexes.json`, versionado no repo, deploy via `firebase deploy --only firestore:indexes`. Esquecer o arquivo no repo quebra deploys.
- **TTL policy**: configurada por coleção, deleta docs automaticamente quando campo timestamp passa do tempo presente.
- **Vector index**: via `gcloud firestore indexes composite create`.

Limite: 200 composite indexes por database.

## Writes

### Operações básicas

```ts
// Admin SDK
await db.collection('users').doc(uid).set({ name }, { merge: true })
await db.collection('users').doc(uid).update({ name })
await db.collection('users').doc(uid).create({ name }) // falha se existe
await db.collection('users').doc(uid).delete()
```

`set` sem `merge` substitui o documento inteiro. `update` falha se o doc não existir. `create` (Admin SDK) falha se já existir — útil para semântica de criação idempotente.

### FieldValue sentinels

```ts
import { FieldValue } from 'firebase-admin/firestore'

await ref.update({
  updatedAt: FieldValue.serverTimestamp(),
  viewCount: FieldValue.increment(1),
  tags: FieldValue.arrayUnion('new-tag'),
  removedTag: FieldValue.arrayRemove('old-tag'),
  legacyField: FieldValue.delete(),
  embedding: FieldValue.vector([0.1, 0.2, ...]),
})
```

`serverTimestamp` e `increment` são atômicos no servidor — preferir sempre sobre read-modify-write em código.

### Batched writes

```ts
const batch = db.batch()
batch.set(ref1, {...})
batch.update(ref2, {...})
batch.delete(ref3)
await batch.commit()
```

Até 500 operações atômicas. Sem leitura dentro do batch.

### Transactions

```ts
await db.runTransaction(async (tx) => {
  const snap = await tx.get(ref)
  if (!snap.exists) throw new Error('missing')
  tx.update(ref, { count: snap.data()!.count + 1 })
})
```

Read-then-write com retry automático em contention. Até 500 docs por transação. Mantenha o callback curto — toda lógica pesada deve sair da transação. Para incrementos puros prefira `FieldValue.increment`.

### Bulk writer (Admin SDK)

```ts
const writer = db.bulkWriter()
for (const item of items) writer.set(db.collection('x').doc(item.id), item)
await writer.close()
```

Para writes massivos (migrations, backfills). Throttling automático respeita o limite sustained de 500 writes/sec por coleção e faz retry em contention.

## Real-time

```ts
const unsubscribe = onSnapshot(query, (snap) => {
  snap.docChanges().forEach((c) => { /* added | modified | removed */ })
})
```

- Latência típica < 1 s.
- Cada documento entregue ao listener conta como 1 read.
- **Sempre guardar `unsubscribe` e chamar no cleanup** (memory leak em SPA é o anti-pattern mais comum).
- Listeners apenas em Client Components (`@stacks/frontend/next@16`).
- Evitar listeners em queries amplas (`collection('users').onSnapshot`) — custo cresce com cada change.

## Limites operacionais

| Limite | Valor |
|---|---|
| Tamanho de documento | 1 MiB |
| Writes sustained por doc | 1/sec |
| Writes por transaction/batch | 500 |
| Reads sustained por coleção | ~30k/min |
| Writes sustained por coleção | ~6k/min |
| Composite indexes por database | 200 |
| Vector field dimensões | 2048 |
| Valores em `in`/`not-in`/`array-contains-any` | 30 |

Valores sustained dependem de sharding interno e da forma das chaves. Hotspotting (chaves monotônicas como timestamps ISO no início do ID) reduz throughput drasticamente — use ULIDs ou IDs aleatórios (veja `@rules/data-modeling`).

## Security Rules

Linguagem declarativa baseada em `match /path/{var}`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow write: if request.auth.uid == uid
                   && request.resource.data.keys().hasOnly(['name', 'email']);
    }
  }
}
```

- Variáveis: `request.auth`, `request.resource.data`, `resource.data`, `request.time`.
- Funções: `get()`, `exists()`, `getAfter()`.
- Deploy: `firebase deploy --only firestore:rules`.
- Testes: `@firebase/rules-unit-testing` com Emulator.

Pontos críticos:

- Client SDK **só é seguro com Rules**. Nunca confiar em validação cliente.
- Admin SDK **bypassa Rules** — toda validação e autorização fica em código (`@rules/validation`, `@rules/security`).
- Rules são parte da superfície de produto: versionar com o resto do código.

## Tipagem em TypeScript

Use `Converter` para tipar leituras e escritas:

```ts
const userConverter: FirestoreDataConverter<User> = {
  toFirestore: (u) => UserSchema.parse(u),
  fromFirestore: (snap) => UserSchema.parse(snap.data()),
}

const ref = db.collection('users').withConverter(userConverter)
```

- Combinar com Zod (`@stacks/validation/zod@4`) no `fromFirestore` para validar contra schema na leitura — protege contra drift entre código e dados antigos.
- `Timestamp.fromDate(date)` / `timestamp.toDate()` para conversões. Nunca armazene `Date` direto via Admin SDK (vira `Timestamp`, mas o tipo TS perde precisão).
- TS 5.4 + Admin SDK: imports nomeados de `firebase-admin/firestore`, não do namespace default (`@stacks/language/typescript@6`).

## Integração com Firebase Functions

Veja `@stacks/backend/firebase-functions`. Triggers nativos:

```ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore'

export const onUserChange = onDocumentWritten('users/{uid}', async (event) => {
  // event.data.before / event.data.after
})
```

- Event ordering **não é garantido**. Handlers devem ser idempotentes.
- Use `event.id` como chave de deduplicação se a operação não é naturalmente idempotente.

## Integração com Next.js 15

Veja `@stacks/frontend/next@16`.

| Lugar | SDK |
|---|---|
| Server Component | Admin |
| Route Handler / Server Action | Admin |
| Client Component | Client |
| Real-time listener | Client (sempre) |

Inicialização Admin SDK em Next.js: idempotente com guard (`getApps().length ? getApps()[0] : initializeApp(...)`) para sobreviver a HMR.

## Paginação

Cursor-based apenas. Offset **não é suportado** (e seria caro mesmo se fosse):

```ts
const first = query(coll, orderBy('createdAt'), limit(20))
const snap = await getDocs(first)
const next = query(coll, orderBy('createdAt'), startAfter(snap.docs.at(-1)), limit(20))
```

Guarde o último `DocumentSnapshot` (não o valor do campo) para cursor estável.

## Backups e recuperação

- **Scheduled backups**: managed export para GCS, agendado via console ou `gcloud`.
- **Point-in-time recovery**: janela de 7 dias, opt-in por database. Habilitar em produção.

## Multi-region e localização

Locations disponíveis incluem `nam5` (multi-region NA), `eur3` (multi-region EU), `southamerica-east1` (São Paulo), entre outras. Escolha leva em conta latência do usuário final e requisitos de residência de dados (LGPD — veja `@rules/governance`). Location é **imutável após criação** — não há migração in-place; requer export/import para outro database.

## Pricing (mental model)

- Reads, writes, deletes cobrados por operação.
- Storage cobrado por GiB/month.
- Egress cobrado por GiB.
- Vector queries cobradas como reads (1 por resultado).
- Listeners cobram 1 read por documento entregue — inclui mudanças subsequentes.

Implicações práticas: dados denormalizados que reduzem reads costumam pagar a si mesmos; listeners em queries amplas são a fonte mais comum de surpresa de fatura.

## Desenvolvimento local

**Firestore Emulator** via Firebase Emulator Suite:

```bash
firebase emulators:start --only firestore
```

- Seed via JSON dump, scripts Admin SDK apontando para `FIRESTORE_EMULATOR_HOST`, ou REST.
- Testes de Security Rules com `@firebase/rules-unit-testing` rodam contra o Emulator.
- Vector search é suportado no Emulator com limitações — cheque docs atuais antes de depender disso em CI.

## Migrations

Firestore não tem migration tool nativa. O padrão do time (veja `@rules/migration`):

1. Scripts idempotentes via Admin SDK + `BulkWriter`.
2. Marker docs em `_migrations/{id}` para rastrear estado (não rodar duas vezes).
3. **Expand-and-contract** para mudanças de schema:
   - Adicionar campo novo; writers começam a escrever ambos.
   - Backfill histórico via BulkWriter.
   - Leitores migram para o campo novo.
   - Remover campo antigo (write path → read path → fisicamente).

Nunca faça `update` em massa numa única transação — use BulkWriter.

## Observabilidade

Veja `@rules/observability`.

- **Cloud Monitoring**: métricas de operações, latência, erros.
- **Firestore Usage dashboard**: heatmap de hotspots, top collections.
- **Composite index miss warnings**: queries sem índice apropriado falham com erro contendo URL para criar o índice — não ignorar; declarar em `firestore.indexes.json`.

## Quando usar Firestore vs Postgres

Comparar com `@stacks/database/postgres`:

| Critério | Firestore | Postgres |
|---|---|---|
| Real-time push | nativo | requer LISTEN/NOTIFY ou logical replication |
| Mobile/offline | nativo (Client SDK) | requer infra externa |
| Scaling sem ops | sim | requer trabalho |
| Hierarquia natural de dados | excelente | possível mas verboso |
| Joins complexos | impossível | nativo |
| Transações multi-table com integridade referencial | limitado a 500 docs | ACID completo |
| Queries ad-hoc / analítica | ruim (use export para BigQuery) | excelente |
| Full-text avançado | requer integração externa (Algolia, Typesense) | nativo (tsvector) |
| Vector search alta dimensionalidade (>2048) | não suportado | pgvector (`@stacks/database/pgvector`) |
| Triggers de evento de dados | nativo via Functions | requer wrappers ou outbox pattern |

## Anti-patterns

- **OR arbitrário entre campos**: queries paralelas + merge cliente custa caro. Re-modele.
- **Listener sem `unsubscribe`**: memory leak garantido em SPA.
- **Transactions longas ou com >500 docs**: alta probabilidade de contention; quebre em batches ou use BulkWriter.
- **Read-modify-write fora de transação**: race condition. Use `runTransaction` ou `FieldValue.increment`.
- **Cursor com `startAt(value)` sem `orderBy`** no mesmo campo: resultado imprevisível.
- **Arrays mutáveis grandes sem dedup**: cada modificação reenviada para todos os listeners; custo de leitura explode.
- **Documentos > 500 KB lidos com frequência**: divida em subdocumentos.
- **Hotspotting com chaves monotônicas**: timestamps ISO no início do ID criam hotspot. Use ULIDs ou IDs aleatórios (`@rules/data-modeling`).
- **Coleção raiz com > 1 M docs sem partition strategy**: queries e listings degradam. Particione por tenant, mês, ou outra chave estável.
- **Listeners em queries broad** (`collection('users').onSnapshot`): custo amplificado a cada change. Restrinja com `where` ou pagine.
- **SDK errado no contexto errado**: Admin SDK em código que sai pro cliente é vazamento de credencial; Client SDK no servidor desperdiça round-trip de autenticação.
- **`firestore.indexes.json` fora do repo**: deploy quebra em ambiente novo. Versione sempre.

## Referências

- https://firebase.google.com/docs/firestore
- https://github.com/firebase/firebase-admin-node
- `@contracts/firebase-firestore` — convenções de modelagem (estrutura de coleções, naming, audit fields, soft-delete)
- `@stacks/backend/firebase-functions` — triggers e idempotência
- `@stacks/database/postgres`, `@stacks/database/pgvector` — comparação relacional / vector
- `@stacks/validation/zod@4` — validação na leitura
- `@stacks/language/typescript@6` — tipagem de converters
- `@stacks/frontend/next@16` — divisão Client/Admin SDK
- `@stacks/ai/vercel-ai-sdk` — geração de embeddings
- `@rules/security`, `@rules/validation`, `@rules/migration`, `@rules/observability`, `@rules/governance`, `@rules/data-modeling`
