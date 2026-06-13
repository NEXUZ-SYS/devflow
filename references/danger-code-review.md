# Ruleset de enforcement — `std-code-review` (CI / Danger.js)

> `std-code-review` é **PR-level**, não um linter de arquivo SI-4. Seu enforcement vive no CI
> (Danger.js ou equivalente) + branch protection do GitHub. Este documento é o ruleset de
> referência — `assets/standards/std-code-review.md` declara `enforcedBy: ci:danger`.

## Regras automatizáveis (Danger.js)

| Regra | Severidade | Sinal |
|---|---|---|
| Diff efetivo ≤ 400 linhas (excl. lockfiles, snapshots, migrations declarativas) | warn | `git.lines_of_code` |
| PR tem ao menos 1 arquivo de teste quando toca `src/` | fail | diff inclui `*.test.*` |
| PR não adiciona segredo/credencial | fail | scan de `.env`, chaves, tokens no diff |
| `it.skip`/`describe.skip`/`xfail` só com issue linkada | fail | regex no diff + ausência de `#\d+`/URL |
| PR de agente de IA marcado com label `ai-generated` | warn | autor/branch heurística |
| Descrição do PR não vazia | fail | `github.pr.body.length > 0` |
| Sem `console.log`/`print` de debug deixado no diff | warn | regex no diff |

## Gates não-automatizáveis (branch protection + convenção humana)

- ≥1 aprovação humana, mesmo em PR gerado por IA.
- 2 aprovações para mudanças em auth, autorização, billing, migrations destrutivas.
- Nunca aprovar com comentário `blocker:` aberto; nunca auto-aprovar.
- Comentários classificados por severidade: `blocker:`/`issue:`/`suggestion:`/`nit:`/`question:`/`praise:`.

## Exemplo de `dangerfile.js` (esqueleto)

```js
import { danger, warn, fail } from "danger";
const bigPR = danger.git.modified_files.length > 0 &&
  (danger.github.pr.additions + danger.github.pr.deletions) > 400;
if (bigPR) warn("PR > 400 linhas de diff — considere dividir por objetivo.");
if (!danger.github.pr.body || danger.github.pr.body.length < 10)
  fail("PR sem descrição do porquê.");
const touchesSrc = danger.git.modified_files.some(f => f.startsWith("src/"));
const hasTests = danger.git.modified_files.some(f => /\.test\./.test(f));
if (touchesSrc && !hasTests) fail("Tocou src/ sem teste — std-test-discipline.");
```
