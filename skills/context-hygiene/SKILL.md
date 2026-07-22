---
name: context-hygiene
description: Use quando o projeto acumulou artefatos de processo obsoletos (planos entregues, specs órfãs, trackings pendurados) e o contexto do agente está poluído — "limpar o projeto", "context rot", "arquivar planos entregues", "/devflow cleanup". Diagnostica 3 categorias e arquiva com segurança só os planos com entrega observável no código.
---

# Higiene de contexto

Retira de circulação artefatos de processo que já cumpriram seu papel, para o agente
parar de ler material obsoleto com aparência de autoridade.

**Announce at start:** "I'm using the devflow:context-hygiene skill to audit context rot."

## Princípio

Nenhum sinal auto-declarado é confiável — checkbox, `progress:`, status em frontmatter.
Ninguém volta para marcar o artefato depois que a entrega saiu, então qualquer mecanismo
que dependa disso apodrece. O critério é **entrega observável no código**: o CLI dá os
fatos, você dá o veredito (ADR-013).

## Step 1 — Coletar fatos

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/context-hygiene.mjs" scan
```

Se `error` não for `null`, **reporte o erro e pare** — não trate como "está limpo".

Se `artifacts` vier vazio, **sempre** informe junto a procedência de `scannedDirs`:
"nenhum artefato encontrado — procurei em `docs/superpowers/plans` (não existe) e
`.context/plans` (não existe)". Vazio-porque-limpo e vazio-porque-procurei-no-lugar-errado
não podem produzir a mesma frase; é o defeito que esta skill existe para combater.

## Step 2 — Julgar (só categoria A)

Para cada artefato `category: "A"` com `movable: true`, abra o plano e verifique se o que
ele descreve **existe hoje no código**: o arquivo/função/skill citada existe? há teste?
saiu release depois?

Use `releasesAfter` como indício, **nunca** como prova — é fato bruto, não veredito. A
ADR-014 proíbe inferir entrega a partir de data ou inatividade: um plano abandonado
também para de receber commits.

Veredito por plano: `ENTREGUE` (evidência encontrada) · `EM ABERTO` (não encontrada) ·
`INCERTO` (ambígua — na dúvida, **não** arquive).

## Step 3 — Apresentar

Tabela com: plano · veredito · **a evidência concreta** que o sustenta · `movable`.

Liste à parte, sem propor ação:
- **B** trackings órfãos em `.context/plans/` — território dotcontext (ADR-006), só denúncia
- **C** specs órfãs

Para todo plano com `hasTracking: true`, declare: *"o tracking `.context/plans/<slug>.md`
referencia este path e ficará com link morto — a ADR-006 impede corrigir automaticamente."*
Consertar não dá; calar não pode.

Sem `--fix`, **pare aqui**: o diagnóstico é o entregável.

## Step 4 — Consentimento e ação

Peça confirmação explícita listando exatamente o que será movido. Nunca execute sob
`autonomy: autonomous` (ADR-012). Só depois do "sim" do operador:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/context-hygiene.mjs" archive --confirmed <paths...>
```

`--confirmed` é gate **mecânico**: sem ele o CLI recusa com exit 2. Emiti-lo sem ter
perguntado é um ato deliberado e rastreável no comando — não uma omissão.

Exit codes: `0` tudo movido · `3` parcial (leia `moved`/`refused` no JSON) · `1` nada
movido · `2` erro de uso.

O CLI recusa sozinho o que o git não protege. Se ele recusar, **relate a recusa** — não
tente contornar.

## Step 5 — Relatório

Movidos · recusados com motivo · reportados sem ação.

Declare sempre estas duas coisas:
1. **A árvore ficou com renames estagiados.** `git mv` estagia mas não commita. Instrua a
   commitar (`chore(hygiene): arquiva planos entregues`) ou a reverter
   (`git reset && git checkout .`). Sob `autoFinish: true`, renames esquecidos no stage
   entram em commit alheio.
2. **A limitação:** `archive/` some da listagem, mas `grep`/`glob` ainda alcançam a pasta.
   A limpeza é parcial — dito, não escondido.

## Escopo

Esta versão detecta **A** (planos), **B** (trackings órfãos) e **C** (specs órfãs).
Docs duplicados e ruído gitignored estão **fora de escopo**: "duplicado" sem definição
operacional vira heurística, que é o que a ADR-014 proíbe. Não relate essas categorias
como vazias — elas não são procuradas.

## Anti-patterns

| Pensamento | Realidade |
|---|---|
| "O checkbox está desmarcado, então não foi entregue" | Sinal morto. Verifique o código. |
| "Está parado há meses, deve estar entregue" | Plano abandonado também para. ADR-014 proíbe. |
| "Vou limpar o `.context/plans/` também" | ADR-006: território dotcontext. Só denuncie. |
| "O CLI recusou, vou mover na mão" | A recusa é a salvaguarda. Relate. |
| "Untracked está obsoleto mesmo, apago" | Untracked = git não protege = WIP possível. |
| "Vazio, então está tudo limpo" | Pode ser que eu tenha procurado no lugar errado. Leia `scannedDirs`. |
| "Passo `--confirmed` porque é óbvio que ele quer" | O gate existe porque o óbvio já errou antes. Pergunte. |
