---
name: odoo-nxz-overlay
description: Overlay NXZ sobre o framework Odoo — arquitetura NXZ ERP, grafo de dependências, ordem de instalação, nomenclatura/bridge nxz_*, hierarquia de módulos POS NXZ e bridges fiscais. Aplicado só em projetos NXZ (gated por profiles/nxz.yaml). Cobre Odoo 12–18.
phases: [P, R, E, V, C]
mode: manual
priority: high
---

# Overlay NXZ — customização do NXZ ERP sobre Odoo (L3)

Esta é a **camada L3** da pilha de skills Odoo do DevFlow. Ela **assume** e **estende**
as camadas base — leia-as primeiro:

- **L1 — framework genérico:** [`odoo-development`](../odoo-development/SKILL.md) (backend:
  ORM, testes, mudanças de API por versão) e
  [`frontend-specialist-odoo`](../frontend-specialist-odoo/SKILL.md) (OWL/QWeb, POS, JS por versão).
- **L2 — localização BR genérica:** [`odoo-l10n-br`](../odoo-l10n-br/SKILL.md) (l10n_br,
  NFC-e/NF-e, SEFAZ, DANFE — nomes OCA, reutilizável fora da NXZ).
- **L3 — este documento:** o que é **específico da NXZ** e não pertence a nenhuma camada
  reutilizável.

> **Ambiente NÃO vive aqui.** Caminhos absolutos, nomes de DB, portas, service-name Docker
> e ambientes de desenvolvimento são **específicos de máquina/projeto** e ficam no
> `.context/odoo-project.md` de cada projeto NXZ — nunca nesta skill distribuível.
> Veja o template `templates/agents/odoo-project-context.example.md`.

## Quando usar

- Trabalhar em módulos `nxz_*` (bridges, REST, POS, fiscal).
- Decidir onde uma customização NXZ deve morar (OCA vs bridge — Separação Arquitetural).
- Navegar o grafo de dependências NXZ e a ordem de instalação.
- Customizar o PDV NXZ (hierarquia de módulos, `NfceProcessor`, DANFE 57/80mm).

## Conteúdo (references)

- **Arquitetura NXZ ERP:** `references/nxz-architecture.md` — camadas do sistema, grafo de
  dependências `nxz_*`, ordem de instalação, nomenclatura e a regra bloqueante de
  Separação Arquitetural OCA vs NXZ (bridge pattern).
- **Hierarquia POS NXZ:** `references/nxz-pos-hierarchy.md` — cadeia
  `point_of_sale → l10n_br_pos → nxz_l10n_br_pos → ...` e os módulos POS NXZ.
- **Bridges fiscais NXZ:** `references/nxz-fiscal-bridges.md` — `nxz_l10n_br_pos_nfce`,
  `NfceProcessor`, DANFE NXZ, separação report base vs bridge.

## Princípio bloqueante — Separação Arquitetural OCA vs NXZ

```
Módulos terceiros (author != "Nexuz"): manter fiéis ao original; só correções de
  compatibilidade/migração. PROIBIDO campos/métodos/views NXZ ou depender de nxz_*.
Módulos NXZ (author = "Nexuz"): toda feature NXZ via _inherit (Python) / patch (JS 18)
  em um módulo bridge nxz_<base>. O módulo base permanece genérico/reutilizável.
```

Em code review, violação dessa separação **BLOQUEIA** até refatorar. Os Standards
`std-odoo-oca-separation` e `std-odoo-fiscal-br-integrity` (profile `nxz`) enforçam isso.

## Orquestração de sub-agentes (NXZ)

| Sub-agente | Fases | Responsabilidade |
|------------|-------|------------------|
| architect-specialist | P, R | Arquitetura, grafo de dependências, ADRs |
| test-writer | E, V | Testes T1/T2/T3, E2E, validação pós-migração |
| code-reviewer | R, V | Compliance OCA, Regra de Ouro de classificação |
| documentation-writer | P, C | Runbooks, ADRs, guias de migração |

## Grounding

Para fatos de framework/versão, consulte L1/L2 e a doc versionada
(`mcp__docs-mcp-server__search_docs`, `github.com/oca`). Este overlay documenta apenas o
que é **decisão/convenção da NXZ**, não API do Odoo.
