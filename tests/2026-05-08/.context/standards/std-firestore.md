---
id: std-firestore
description: Firestore Web SDK como base operacional canônica de leitura/sincronização na camada Frontend
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-firestore-frontend"]
enforcement:
  linter: standards/machine/std-firestore.js
weakStandardWarning: true
---
# Standard: firestore
## Princípios
Adotar **Firestore Web SDK** (modular `firebase/firestore`) como cliente canônico de leitura e mutação no Frontend. Acesso exclusivo via API modular tree-shakeable; nunca compat-API. Auth via Firebase Auth client; ID token propagado ao BFF. Persistência IndexedDB habilitada (`persistentLocalCache`) para offline e tab-sync. Listeners (`onSnapshot`) consumidos por hooks de feature isolados; nenhum componente UI assina diretamente. Mutações sensíveis (cross-context, agregações, idempotência forte) sempre via BFF Admin SDK — Web SDK só para escritas escopadas pelo usuário autenticado e protegidas por Security Rules. Schemas validados por Zod nas bordas de leitura.
## Anti-patterns
| Errado | Certo |
|---|---|
| importar `firebase-admin` no Frontend; mutações privilegiadas vão pelo BFF. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| expor service account credentials no client; apenas Web App config (público). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-firestore.js` verifica:

1. bloqueia `firebase-admin` em `apps/web/**` e uso de compat-API.
2. ESLint `no-restricted-imports` proíbe `firebase/firestore/compat` e `firebase-admin`.
3. Vitest + Firestore emulator cobrem rules; Testing Library cobre hooks com mocks; Playwright cobre fluxo offline/online.
4. Gate PREVC: pipeline CI roda emulator suite e falha se rules permitem leitura cross-tenant.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-firestore-frontend (`013-adr-firestore-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Firestore Web SDK Reference](https://firebase.google.com/docs/reference/js/firestore_)
- [Firestore Modular API](https://firebase.google.com/docs/firestore/quickstart)
- [Security Rules Language](https://firebase.google.com/docs/rules/rules-language)
- [Offline Persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase JS SDK GitHub](https://github.com/firebase/firebase-js-sdk)
  const [items, setItems] = useState<Resource[]>([]);
  }, [tenantId]);
Authoring guide: `.context/standards/README.md`
