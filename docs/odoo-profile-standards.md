# Standards default do Odoo (profile-scoped)

> Como o DevFlow entrega enforcement de desenvolvimento Odoo **só** em projetos Odoo.

## O que é

O DevFlow embute **17 Standards de enforcement** específicos do framework Odoo. Ao contrário dos ~21 Standards **universais** (`assets/standards/`, carregados em todo projeto), os de Odoo são **profile-scoped**: só entram em ação quando o projeto é detectado como Odoo (via `profiles/odoo.yaml` — presença de `__manifest__.py`/`__openerp__.py` ou dep `odoo` no manifest Python).

Cada Standard é o trio canônico: **prosa** (`std-odoo-*.md`) + **frontmatter** (tooling) + **linter** (`machine/std-odoo-*.js`, CI). Todos são *concern-framed* (regra operacional que atravessa módulos), nunca nomeados por módulo/subsistema.

## Onde moram

```
assets/standards/profiles/odoo/
  MANIFEST.txt              # índice canônico (mirror de profiles/odoo.yaml)
  std-odoo-*.md   (17)      # prosa
  machine/std-odoo-*.js (17)# linters bundled
```

`profiles/odoo.yaml` lista os 17 ids na chave `standards:` (espelhada no MANIFEST; integridade garantida por `tests/integration/test-profile-standards-integrity.mjs`).

## Como são ativados

Na inicialização (`/devflow init` → `project-init`) ou no sync (`context-sync`), quando o perfil Odoo casa, os arquivos são **copiados** para `.context/engineering/standards/` (+`machine/`) do projeto. Aí viram `origin:"project"` e rodam sob o sandbox de linter do próprio projeto (SI-4) — **sem** alterar a allowlist do set universal (invariante anti-RCE do ADR-007 preservada). É o mesmo modelo de cópia já usado para agents/skills de perfil.

> Por que cópia e não merge ao vivo? O sandbox `origin:"default"` trava linters em `<plugin>/assets/standards/machine/`. Live-merge dos profile linters exigiria abrir essa allowlist (superfície de segurança). A cópia mantém o sandbox crítico intocado.

Para desativar um Standard num projeto: `.context/standards.local.yaml` → `disable: [std-odoo-...]`.

## Os 17 Standards

| Tier | Standards | Lint |
|---|---|---|
| **1 — forte** | naming-conventions, manifest-hygiene, orm-discipline, computed-fields, i18n, code-hygiene, version-api-hygiene, js-modules, qweb-escaping, test-discipline | estático sólido |
| **2 — parcial** | module-structure, orm-performance, security, owl-patterns | heurístico (AST/cross-file) |
| **3 — NXZ** | oca-separation, qweb-pdf-safety, fiscal-br-integrity | `weakStandardWarning`; maioria human-review |

Fontes: doc oficial Odoo 12/17/18, OCA `pylint-odoo`/`odoo-pre-commit-hooks`, e refs internas NXZ (Tier 3). Cada `.md` cita suas fontes em `## Referência`.

## Stacks (docs versionados)

`profiles/odoo.yaml` também declara, na chave `stacks:`, a wishlist de docs Odoo 12/17/18 (`discoveryHints` → `odoo.com/documentation/{ver}/`). Na init, cada uma é semeada no manifest de stacks do projeto como entrada `mcpIndexed`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/devflow-stacks.mjs" add \
  --lib=odoo-18 --version=18.0 \
  --discovery-hint=https://www.odoo.com/documentation/18.0/developer/ --project=<PWD>
```

A indexação real (scrape recursivo para o store global do `docs-mcp-server`) é um follow-up rodado pelo usuário via `/devflow:scrape-stack-batch`. Consumidores (agents, camadas) consultam via `mcp__docs-mcp-server__search_docs`.

## Como estender

Adicionar um novo Standard de Odoo: crie `std-odoo-<id>.md` + `machine/std-odoo-<id>.js` + teste em `tests/odoo-standards/`, e adicione o id ao `MANIFEST.txt` **e** ao `profiles/odoo.yaml standards:` (o teste de integridade exige o mirror). Para outro framework, crie `profiles/<fw>.yaml` com sua própria chave `standards:` apontando para `assets/standards/profiles/<fw>/`.
