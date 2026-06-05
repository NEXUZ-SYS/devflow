# Sync do repo standalone de standards (`devflow-standards`)

> Como o repo upstream `NEXUZ-SYS/devflow-standards` se relaciona com o plugin,
> o que é fetchado em runtime e o que é sincronizado **só no release**.
> Referência canônica: ADR-007 v2.2.0.

## 1. Layout DDC do repo standalone

O repo `NEXUZ-SYS/devflow-standards` adota o **layout DDC**, igual ao `.context/`
de qualquer projeto DevFlow:

```
.context/
├── business/        # README (reservado p/ conteúdo default futuro)
├── product/         # README (reservado)
├── operations/      # README (reservado)
└── engineering/
    └── standards/
        ├── MANIFEST.txt        # lista canônica dos std-*.md
        ├── std-*.md            # os standards (FONTE canônica navegável)
        └── machine/
            └── std-*.js        # linters — FONTE, mas bundled-only (ver §3)
```

O **root** do repo é mantido limpo: não há mais `MANIFEST.txt`/`std-*.md` soltos
(layout plano legado, pré-v2.2.0). O repo é, ele próprio, um contexto DDC
navegável por IA.

## 2. O que o `update` fetcha (runtime)

`scripts/update-default-standards.sh` refresca o snapshot vendorizado do plugin
(`assets/standards/*.md`) buscando por HTTPS **apenas os `.md`**, do subpath:

```
https://raw.githubusercontent.com/NEXUZ-SYS/devflow-standards/main/.context/engineering/standards/<arquivo>
```

- O HEAD guard bate em `…/.context/engineering/standards/MANIFEST.txt`. Offline /
  repo não-live → exit 0 (no-op limpo, snapshot bundlado preservado).
- O subpath `.context/engineering/standards` é uma **constante controlada pelo
  plugin** (`STD_SUBPATH`) — NUNCA derivada do MANIFEST nem de conteúdo remoto
  (anti path-traversal, R4).
- A lista de arquivos vem do **MANIFEST local** (fonte confiável), cada entrada
  validada contra `^std-[a-z][a-z0-9-]+\.md$`; o destino é
  `assets/standards/$(basename validado)`.
- O corpo `.md` fetchado passa por sanitização SI-6 antes de gravar.

## 3. Invariante anti-RCE: `machine/*.js` é bundled-only

Os linters `machine/std-*.js` existem **como FONTE** no repo standalone (em
`.context/engineering/standards/machine/`), mas **NUNCA são fetchados** pelo
`update`. Código executável buscado por HTTPS = RCE — proibido por invariante.

- O `update` busca **só `.md`**. Nenhum `.js` é escrito no destino, em hipótese
  alguma (provado pelos Tests 5 e 6 de `tests/scripts/test-update-default-standards.sh`).
- Os `.js` que o plugin de fato executa vivem em `assets/standards/machine/*.js`
  (parte do TCB do plugin, não user-writable pós-install).
- O repo standalone guarda os `.js` apenas como **fonte de verdade revisável** —
  a cópia que roda é a bundlada no plugin.

## 4. Sync `.js` no release (com revisão + byte-match)

Quando um linter muda, a sincronização plugin ↔ repo standalone acontece **no
release**, com revisão humana e verificação byte-match — **nunca** via fetch em
runtime:

1. Editar/revisar o linter em `assets/standards/machine/std-<id>.js` (plugin, TCB).
2. Atualizar a FONTE correspondente no repo standalone
   (`.context/engineering/standards/machine/std-<id>.js`) com o conteúdo idêntico.
3. **Verificação byte-match** (release/CI) — clonar o repo e diferenciar os `.js`
   contra o plugin; o diff deve ser vazio:

   ```bash
   tmp=$(mktemp -d)
   gh repo clone NEXUZ-SYS/devflow-standards "$tmp"
   diff -r "${PLUGIN_ROOT}/assets/standards/machine" \
           "$tmp/.context/engineering/standards/machine"
   # saída vazia = linters idênticos plugin ↔ repo
   rm -rf "$tmp"
   ```

4. Se o diff não for vazio, o release está em **drift** — reconciliar antes de
   publicar.

> Os `.md` não precisam desse passo: são fetchados em runtime pelo `update`, então
> a fonte de verdade dos `.md` é o repo standalone. Só os `.js` (bundled-only)
> exigem o sync byte-match de release.

## 5. Migração do plugin antigo

Um plugin pré-v2.2.0 (root-targeting) rodando contra o repo já reestruturado faz
HEAD no root → 404 → no-op limpo (exit 0, snapshot intacto, sem reversão). A
janela de migração é segura: nenhum usuário quebra; quem não atualizou
simplesmente deixa de refrescar até atualizar. Provado por Test 7 (AC2).
