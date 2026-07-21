# Backlog (gap de produto) — `suggest-bump.mjs` sempre sugere `patch` no signpost do Step 8.1

**Data:** 2026-07-21 · **Tipo:** gap de plugin (genérico, afeta clientes) · **Severidade:** baixa-média
**Descoberto:** finalizando o N0 do import-reversa (release v1.31.0), ao notar que a sugestão `patch` contradizia um commit `feat`.

---

## O defeito (determinístico, verificado)

No fluxo canônico da `devflow:prevc-confirmation`:

1. **Step 4 — Finalize Branch** (SKILL.md:251, Caminho A) termina com:
   ```bash
   gh pr merge "$PR_NUMBER" "$STRATEGY_FLAG" --delete-branch
   git checkout main && git pull      # ← HEAD passa a ser == origin/main
   ```
2. **Step 8.1 — Sinalizar release pendente** (SKILL.md:388, *depois* do Step 4) chama:
   ```bash
   node ".../scripts/lib/finalize/suggest-bump.mjs"     # sem argumento
   ```
3. O helper (`suggest-bump.mjs:30`): `const base = argv[0] || "origin/main"` — analisa `origin/main..HEAD`.

Como o Step 4 já sincronizou a main, **`origin/main..HEAD` é vazio** → nenhum commit para classificar → **fallback `patch`**, sempre, qualquer que seja a entrega.

**Prova (sessão do N0):**
```
range origin/main..HEAD (estado pós-Step-4) → patch      ← o que o signpost emite
range v1.30.0..HEAD (correto)               → minor      ← o que a entrega era (commit feat)
```
O commit mergeado era `feat(import-reversa): …` e o CHANGELOG trazia `### Added`; o release correto foi **1.31.0** (minor), não 1.30.1 (patch).

## Por que importa (e por que não é crítico)

- O bump é **sugestão**; a skill é explícita que o operador confirma (julgamento semver). Nada é publicado errado sozinho.
- Mas o helper existe **exatamente** para acertar essa sugestão. Sempre responder `patch` o torna inútil e induz bump subestimado — uma `feat` sairia como patch se o operador confiar.
- Agrava sob `autonomy: autonomous`, onde a confirmação humana é mais fraca.

## Correção proposta

**(a) Mínima — no call site (Step 8.1 da SKILL.md):** passar a última tag como base.
```bash
node ".../suggest-bump.mjs" "$(git describe --tags --abbrev=0 2>/dev/null || echo origin/main)"
```
**(b) Robusta — no helper:** trocar o default de `origin/main` para a última tag (`git describe --tags --abbrev=0`), caindo para `origin/main` se não houver tag. Faz o helper acertar independentemente de quem o chama e de já ter havido merge.

**Recomendação:** (b) — o default errado é a raiz; corrigir no helper protege todos os call sites. Manter (a) como reforço explícito. **TDD:** teste cobrindo "range vazio pós-merge → ainda deriva do último release", que é o caso que hoje falha silenciosamente.

## Ligações
- Feature que expôs: N0 do import-reversa (PR #80) / release v1.31.0 (PR #81).
- Mesma família do [signpost de release](../../.context/plans/confirmation-release-signpost.md): o Step 8.1 nasceu para evitar release órfão; este gap degrada a qualidade do sinal que ele emite.
