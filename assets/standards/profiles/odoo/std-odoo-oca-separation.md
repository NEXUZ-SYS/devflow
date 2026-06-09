---
id: std-odoo-oca-separation
description: Separação arquitetural OCA/terceiros vs NXZ — módulos de terceiros ficam fiéis ao original; extensão NXZ vai num módulo bridge via _inherit
version: 1.0.0
source: devflow-default-odoo
applyTo: ["**/__manifest__.py", "**/__openerp__.py"]
activation: on-demand
relatedAdrs: []
weakStandardWarning: true
enforcement:
  linter: machine/std-odoo-oca-separation.js
---
## Princípios

- **Módulo de terceiro fica fiel ao original.** Tudo que não é de autoria NXZ — módulos da OCA, do core Odoo ou de qualquer fornecedor — deve permanecer idêntico à versão adotada na migração. Não se acrescenta campo, não se altera classe, não se mexe na lógica. Quanto mais perto do upstream, mais barato é atualizar o módulo numa migração futura e mais fácil é reportar/aplicar correções da comunidade.
- **A camada NXZ vive isolada num módulo bridge.** Quando o negócio NXZ precisa estender um módulo de terceiro, a extensão entra num **módulo bridge dedicado** — convencionalmente nomeado `nxz_<modulo_base>_bridge` — que declara o terceiro como dependência e herda seus models por `_inherit` (ou `_inherits`). É no bridge que moram os campos `nxz_*`, os métodos e as views customizadas.
- **Campos `nxz_*` são marca da camada NXZ.** O prefixo `nxz_` sinaliza propriedade NXZ. Por definição, ele **nunca** aparece num módulo de terceiro: vê-lo lá significa que alguém escreveu por cima do upstream em vez de criar o bridge. Em módulos NXZ (author contendo "Nexuz"/"NXZ"), campos `nxz_*` são esperados e legítimos.
- **Author do manifest é a fonte da verdade.** A autoria do módulo é declarada no `author` do `__manifest__.py`. É esse campo que separa "código que podemos mexer livremente" (NXZ) de "código que tratamos como imutável" (terceiro).

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `nxz_custom = fields.Char()` adicionado direto num model de módulo OCA/terceiro | Crie um módulo bridge `nxz_<modulo>_bridge`, declare `_inherit` do model do terceiro e mova o campo `nxz_*` para lá |
| Monkey-patch de uma classe de terceiro (sobrescrever método/atributo de fora, sem herança) | Estenda via `_inherit`/`_inherits` no bridge; nunca remende a classe do terceiro por fora |
| Editar arquivos do módulo OCA/terceiro para encaixar regra de negócio NXZ | Mantenha o terceiro fiel à versão da migração; toda customização vai para o bridge |
| Bridge com nome fora do padrão (ex.: `custom_account`, `nxz_account`) | Nomeie o bridge `nxz_<modulo_oca>_bridge` (ex.: `nxz_account_bridge`) |
| Misturar models NXZ próprios e extensões de terceiro no mesmo módulo de terceiro | Separe: o terceiro permanece intacto; o que é NXZ fica no bridge |

## Linter

`machine/std-odoo-oca-separation.js` (Node, sem deps). Recebe o caminho do arquivo em `argv[2]`. **Gate por basename:** só processa `__manifest__.py` ou `__openerp__.py` — qualquer outro arquivo resulta em `exit 0` (não é âncora de módulo). Como o manifest mora na raiz do módulo, o linter ancora nele para descobrir a autoria e usa `dirname(filePath)` como diretório do módulo.

**1 check heurístico (`weakStandardWarning`):**

1. **Campo `nxz_*` em módulo de terceiro.** O linter extrai o `author` do manifest (regex `['"]author['"]\s*:\s*['"]([^'"]+)['"]`). Se o `author` contém "Nexuz" ou "NXZ" (case-insensitive), o módulo é NXZ e o linter sai com `exit 0` (campos `nxz_*` são esperados). Caso contrário, é módulo de terceiro: o linter varre os `.py` do módulo (raiz + `models/`, recursão rasa) e, se algum **define** um campo `nxz_*` (regex `^\s*nxz_\w+\s*=\s*fields\.`), emite `campo nxz_* em módulo de terceiro (author='<author>') — use módulo bridge nxz_*_bridge com _inherit`.

Se o manifest **não tem** `author`, o linter trata como indeterminado e **não flaga** (`exit 0`) — é human-review. Violação imprime `VIOLATION: ...` e sai com `exit 1`; módulo conforme sai com `exit 0`. Erros de IO (`readFile`/`readdir`/`stat`) são tolerados (não geram flag).

> **Aviso (weak standard):** este check é uma heurística parcial. Depende da declaração correta do `author` no manifest e de uma varredura rasa por **definição textual** de campo (regex), não de uma análise semântica do AST Python. Casos legítimos podem passar e violações sutis (ex.: campo definido fora de `models/`, autoria mal declarada, herança dinâmica) podem escapar. Use o resultado como sinal, não como veredito — confirme na revisão de PR.

As demais regras são **human-review** (não automatizadas) — confira na revisão de PR:

- **Nunca monkey-patch** de classe de terceiro: toda extensão passa por herança.
- **Bridge herda via `_inherit`/`_inherits`** o(s) model(s) do módulo de terceiro, declarando-o como dependência no manifest.
- **Nomenclatura do bridge:** `nxz_<modulo_oca>_bridge`.
- **Terceiros fiéis à versão da migração:** nenhum arquivo do módulo de terceiro editado para fins de customização NXZ.

## Referência

Origem **interna NXZ** (regra arquitetural NXZ, não documentação oficial Odoo):

- Skill `odoo-development`, seção 1.5 "Separação Arquitetural OCA vs NXZ" — define que módulos de terceiros permanecem fiéis ao upstream e que a customização NXZ vive em módulos bridge.
- Agent `odoo-specialist.md`, princípio 2 — extensão de módulos de terceiros sempre via bridge com `_inherit`, nunca por edição direta ou monkey-patch.
