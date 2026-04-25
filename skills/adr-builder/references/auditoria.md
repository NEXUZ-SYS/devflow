# Auditoria de ADR Existente

Roteiro para o modo `audit` do skill. Recebe um ADR já escrito e retorna um relatório estruturado com gaps classificados.

## Filosofia

Uma ADR existente merece respeito: não reescreva o texto do usuário silenciosamente. Classifique cada violação como:

- **PASS** — regra cumprida, não mexer
- **FIX-AUTO** — violação objetiva, corrigível sem julgamento humano (formato, metadados, seções proibidas, frases redundantes)
- **FIX-INTERVIEW** — violação de conteúdo, precisa do usuário (alternativas faltando, guardrails vagos, produto misturado com stack, fontes não-oficiais)

A fronteira é simples: se a correção exige **decidir o que a ADR deveria dizer**, é FIX-INTERVIEW. Se é apenas **como dizer o que já está lá**, é FIX-AUTO.

## Os 11 checks

Execute todos, sempre na ordem abaixo. Relate mesmo os PASS — o usuário precisa ver o que está correto.

### Check 1 — Frontmatter estrutural

**Verificar:** presença e validade dos campos `type`, `name`, `description`, `scope`, `source`, `stack`, `category`, `status`, `version`, `created`, `supersedes`, `refines`, `protocol_contract`, `decision_kind`.

| Condição | Classificação |
|---|---|
| Todos presentes e válidos | PASS |
| Falta `version` ou está ≠ semver | FIX-AUTO (set `0.1.0`) |
| Falta `supersedes` | FIX-AUTO (set `[]`) |
| Falta `refines` | FIX-AUTO (set `[]`) |
| Falta `protocol_contract` | FIX-AUTO (set `null`) |
| Falta `decision_kind` | FIX-AUTO (set `firm`) |
| Falta `type: adr` | FIX-AUTO (add) |
| Falta `created` ou data inválida | FIX-AUTO (set hoje) |
| `scope` ≠ `organizational`/`project` | FIX-INTERVIEW |
| `category` ≠ uma das 7 válidas | FIX-INTERVIEW |
| `decision_kind` ≠ `firm`/`gated`/`reversible` | FIX-AUTO (set `firm`, avisar) |
| `category: protocol-contracts` mas `protocol_contract: null` | FIX-INTERVIEW (pedir nome + versão do contrato) |
| `status: Aprovado` em ADR nova | FIX-AUTO (reverter para `Proposto`) |

### Check 2 — Título e voz da Decisão

**Verificar:** título é frase nominal curta; Decisão está em voz ativa afirmativa.

| Condição | Classificação |
|---|---|
| Título é pergunta ou frase vazia ("Sobre X", "Decisão sobre Y") | FIX-INTERVIEW |
| Decisão em voz passiva ou condicional ("seria bom", "talvez") | FIX-INTERVIEW |
| Decisão mistura 2+ decisões distintas | FIX-INTERVIEW (sugerir split em ADRs separadas) |

### Check 3 — Foco em stack (não em produto/negócio)

**Verificar:** zero menções a nomes de produtos internos, verticais de mercado, clientes, features de usuário final, processos operacionais.

Fonte das listas: `assets/context.yaml` (campos `product_names`, `business_verticals`). Se o arquivo não existir, usar os defaults documentados como fallback. A listagem abaixo é ilustrativa — a verdade está no YAML.

Heurísticas de detecção:
- Nomes próprios de produtos da empresa (do campo `product_names` em `context.yaml`)
- Verticais de mercado (do campo `business_verticals` em `context.yaml`)
- Jornadas: "o usuário clica", "o cliente compra", "o gerente aprova"
- KPIs de negócio: "ticket médio", "CMV", "churn"

| Condição | Classificação |
|---|---|
| Nenhuma menção encontrada | PASS |
| 1-2 menções incidentais (ex: no texto de alternativas) | FIX-INTERVIEW (reescrever em termos técnicos) |
| Contexto/Decisão estruturalmente baseados em produto | FIX-INTERVIEW (reescrita extensa necessária) |

### Check 4 — Alternativas mínimas

**Verificar:** pelo menos 2 alternativas descartadas + 1 escolhida (total ≥ 3), cada uma com tradeoff.

| Condição | Classificação |
|---|---|
| ≥ 3 alternativas com tradeoffs | PASS |
| Só a escolhida listada | FIX-INTERVIEW (obrigatório) |
| 2 alternativas sem tradeoff | FIX-INTERVIEW |
| Escolhida não marcada com ✓ ou "(escolhida)" | FIX-AUTO |

### Check 5 — Guardrails acionáveis

**Verificar:** ≥ 2 guardrails, cada um iniciado com `SEMPRE`/`NUNCA`/`QUANDO…ENTÃO`, cada um verificável em code review.

Heurísticas de detecção de vaguidade:
- "Seguir boas práticas"
- "Ter cuidado com"
- "Considerar X"
- "Evitar abusos"
- Qualquer verbo sem sujeito/objeto concreto

| Condição | Classificação |
|---|---|
| ≥ 2 guardrails concretos com verbo imperativo | PASS |
| Guardrails sem `SEMPRE`/`NUNCA`/`QUANDO…ENTÃO` mas conteúdo concreto | FIX-AUTO (reformatar) |
| Guardrails vagos | FIX-INTERVIEW |
| < 2 guardrails | FIX-INTERVIEW |

### Check 6 — Enforcement concreto

**Verificar:** ≥ 1 mecanismo concreto (ferramenta + regra, ou fase + check).

| Condição | Classificação |
|---|---|
| ≥ 1 check concreto com ferramenta nomeada | PASS |
| Apenas "code review" sem critério | FIX-INTERVIEW |
| Checkboxes fora do formato `- [ ]` | FIX-AUTO |

### Check 7 — Ausência da seção "Relacionamentos"

**Verificar:** ADR **não** contém seção `## Relacionamentos`, `## Relationships`, `## Related ADRs` ou equivalente.

| Condição | Classificação |
|---|---|
| Seção ausente | PASS |
| Seção presente com conteúdo | FIX-AUTO (migrar docs externos para Evidências; migrar slugs para `supersedes` se houver); deletar seção |

### Check 8 — Evidências só com fontes oficiais

**Verificar:** zero links para Medium, dev.to, blogs pessoais, Stack Overflow, YouTube, tutoriais de terceiros.

| Condição | Classificação |
|---|---|
| Só fontes oficiais | PASS |
| 1+ link proibido | FIX-INTERVIEW (pedir equivalente oficial) |
| Seção Evidências ausente | FIX-INTERVIEW (obrigatória pelo template) |

### Check 9 — Densidade e comprimento

**Verificar:** total entre 80 e 120 linhas (`wc -l`); ausência de frases expositivas proibidas.

**Exceção tabular (Hard Rule #10):** ADRs cujo conteúdo principal é inerentemente tabular (SLOs com targets/alerts, request-response contracts, mapping tables, enum taxonomies) podem chegar a 180 linhas. A exceção aplica quando: (a) a densidade extra vem de uma tabela, não de prosa, e (b) a ADR contém no máximo uma dessas tabelas. Detectar contando linhas dentro de blocos `| ... |` — se ≥ 60% das linhas excedentes são de tabela, a exceção é válida.

Frases proibidas (grep case-insensitive):
- "isto significa que"
- "em outras palavras"
- "ou seja,"
- "basicamente"
- "de forma mais simples"
- Definições de conceitos técnicos correntes (SRP, FSD, tree-shaking, RBAC, idempotência, etc.)

| Condição | Classificação |
|---|---|
| 80-120 linhas + sem frases proibidas | PASS |
| 121-180 linhas **com exceção tabular válida** | PASS |
| 121-200 linhas sem exceção tabular, sem frases proibidas | FIX-INTERVIEW (compactação exige julgamento) |
| > 200 linhas (qualquer causa) | FIX-INTERVIEW (provavelmente precisa split) |
| < 80 linhas | FIX-INTERVIEW (provavelmente falta conteúdo obrigatório) |
| Frases proibidas presentes | FIX-AUTO (deletar frase) |

### Check 10 — Exemplo de código minimal

**Verificar:** se há bloco de código em Evidências, ele é ≤ 25 linhas (fences incluídas) e demonstra o padrão, não a implementação completa.

| Condição | Classificação |
|---|---|
| Sem código, ou código ≤ 25 linhas | PASS |
| Código > 25 linhas | FIX-INTERVIEW (escolher o componente mais representativo) |
| Múltiplos blocos de código | FIX-INTERVIEW (manter apenas o mais representativo) |

### Check 11 — Padrões nomeados do catálogo

**Verificar:** quando a ADR descreve um padrão state-of-art já catalogado em `assets/patterns-catalog.md`, o padrão é **nomeado explicitamente** no Contexto ou Decisão — não descrito por paráfrase.

Ler `assets/patterns-catalog.md` e, para cada padrão listado, procurar:
- Nome canônico do padrão (ex: "canonical isolation", "triple-tenant", "BYOK", "RFC 7807", "canonical IDs", "inflight coalescing")
- Sintomas paráfrase: a ADR descreve o comportamento ("isolamos dados por tenant via prefixo de ID", "padronizamos erros HTTP em JSON estruturado") sem nomear o padrão.

| Condição | Classificação |
|---|---|
| Padrão do catálogo aplicável e nomeado | PASS |
| Nenhum padrão do catálogo é aplicável à ADR | PASS |
| Padrão aplicável mas descrito por paráfrase sem nomear | FIX-INTERVIEW (confirmar com autor se é coincidência terminológica ou se deve nomear) |

**Atenção:** este check é conservador — descrições técnicas podem coincidir com o vocabulário do catálogo por acaso. Nunca `FIX-AUTO` aqui; sempre perguntar ao autor.

## Formato do relatório de auditoria

Após rodar os 11 checks, monte um relatório estruturado:

```markdown
# Relatório de Auditoria — <nome da ADR>

**Arquivo analisado:** <path ou "colado na conversa">
**Template de referência:** `assets/TEMPLATE-ADR.md` (versão do skill)

## Resumo

- ✅ PASS: N/11
- 🔧 FIX-AUTO: M (auto-corrigíveis)
- ❓ FIX-INTERVIEW: K (precisam de entrada sua)

## Detalhamento

| # | Check | Status | Diagnóstico |
|---|---|---|---|
| 1 | Frontmatter estrutural | FIX-AUTO | Falta `version` e `supersedes`. |
| 2 | Título e voz da Decisão | PASS | — |
| ... | ... | ... | ... |

## Gaps auto-corrigíveis (M)

- [descrição objetiva 1]
- [descrição objetiva 2]

## Gaps que precisam de entrada sua (K)

- [descrição objetiva + pergunta direta 1]
- [descrição objetiva + pergunta direta 2]
```

Depois do relatório, seguir para o Step A3 do SKILL.md (perguntar como proceder).

## Regras de conduta na auditoria

- **Não reescreva sem autorização.** A auditoria só diagnostica; correção vem apenas após o usuário escolher "Corrigir" no Step A3.
- **Não invente conteúdo ao corrigir.** FIX-AUTO só corrige forma. FIX-INTERVIEW exige pergunta — nunca adivinhe o que o usuário "provavelmente quis dizer".
- **Preserve as palavras do autor.** Quando o conteúdo está correto mas o formato não (ex: guardrail concreto sem `SEMPRE` na frente), apenas reformate — não parafraseie.
- **Seja específico.** "Frontmatter incompleto" é diagnóstico ruim. "Falta `version: 0.1.0` e `supersedes: []`" é diagnóstico útil.
- **Relate PASS também.** Usuário precisa ver o que está certo para confiar no que está errado.
