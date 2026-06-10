# Plano — Modo doc-grounding obrigatório (`.devflow.yaml`)

> Status: **plano aprovado nas decisões-chave — aguardando go de implementação** · Branch: `feat/grounding-docs-only-mode` · Origem: incidente onde `search_docs` deu timeout e o agente respondeu de memória.
>
> **Decisões travadas:** (1) escopo = **só fatos de stack externo** (lib/framework/API/versão); raciocínio geral, código do próprio projeto (via Read/Grep) e contexto da conversa permanecem livres. (2) entregar **ambos os modos** `docs-first` + `docs-only`.
> Relacionados: `std-grounding` (existente, prose-only) · `hooks/pre-tool-use` · `hooks/session-start` · `devflow:config` · `devflow:project-init` · ADR-004 (permissions deny-first).

---

## 1. Problema

Quando o MCP de documentação falha (timeout/vazio) ou o agente simplesmente "sabe" a resposta, ele responde de **memória de treino** ou faz **web search** — exatamente o que aconteceu no `search_docs` do odoo-18. Para libs/APIs versionadas isso é perigoso: o treino pode estar desatualizado e a internet traz fonte não-canônica. O usuário quer um flag que **force o sourcing apenas do MCP de docs**.

## 2. Honestidade de escopo (define o desenho — leia primeiro)

Um flag em `.devflow.yaml` é **dado lido pelo agente/hooks**, não uma trava nos pesos do modelo. Logo, separe o que é **enforçável por máquina** do que é **diretiva comportamental**:

| Camada | Enforçável? | Como |
|---|---|---|
| Bloquear `WebSearch`/`WebFetch` e MCP de internet | ✅ **Hard** | `pre-tool-use` emite `permissionDecision=deny` (mecânica já existe) |
| Exigir citação do MCP em afirmação factual | ✅ **Semi** | Diretiva + checagem opcional no `post-tool-use` (auditável) |
| Fail-closed: MCP down/vazio → parar e avisar, não chutar | ✅ **Semi** | Diretiva forte + protocolo de resposta |
| "Não usar conhecimento de treino" | ⚠️ **Soft** | Só instrução — não há trava técnica; mitigado pelas 3 acima |

**Conclusão honesta:** o flag **não me lobotomiza**. Ele eleva a guarda a: *web bloqueado (hard) + citação obrigatória + fail-closed*, o que na prática elimina a maior parte das respostas não-aterradas — mas a supressão total do conhecimento de treino é compromisso comportamental, não garantia. O plano não promete o impossível.

## 3. Escopo do bloqueio (crítico — não é "todo conhecimento")

Bloquear **todo** uso de conhecimento de treino é impraticável (o agente precisa de raciocínio geral, sintaxe básica, e do próprio código do projeto). O escopo correto do modo é:

- **SUJEITO a grounding (precisa de fonte):** afirmações factuais sobre **libs/frameworks/APIs/versões externas** — assinaturas, nomes de método, opções de config, comportamento por versão, "X foi removido em Y".
- **LIVRE (não precisa do MCP):** raciocínio/algoritmia geral; o **código do próprio projeto** (verificável por Read/Grep/Glob — é o que o `std-grounding` já cobre); contexto da conversa; sintaxe de linguagem trivial.

Ou seja, este modo é o `std-grounding` **estendido para conhecimento externo de stack**, com o MCP de docs como fonte canônica (em vez do repo).

## 4. Schema de config (`.context/.devflow.yaml`)

Nova seção `grounding:` (default desativado — opt-in):

```yaml
grounding:
  mode: off            # off | docs-first | docs-only
  docsMcpServer: docs-mcp-server   # qual server MCP é a FONTE canônica (ver §8)
  blockWeb: true       # nega WebSearch/WebFetch quando mode != off
  blockToolPatterns: []  # padrões extras de tool-name de MCP de internet a negar (ex: "rag-web-browser")
  failClosed: true     # MCP indisponível/vazio → parar e declarar, não responder de memória
  requireCitation: true # toda afirmação de stack cita o resultado do MCP (lib@versão)
```

Semântica dos modos:
- **`off`** (default): comportamento atual.
- **`docs-first`**: consultar o MCP primeiro; se vazio/indisponível, pode complementar com conhecimento **declarando explicitamente** "fonte: conhecimento de treino, não verificado no MCP". Web continua bloqueado se `blockWeb`.
- **`docs-only`** (o que o usuário pediu): **estrito**. Afirmação de stack só com resultado do MCP. MCP vazio/down → fail-closed (parar + avisar). Web bloqueado.

## 5. Camadas de implementação

### 5a. Hard enforcement — `hooks/pre-tool-use` (bloqueio de web)
Estende o hook (que já lê `.context/.devflow.yaml` e já emite `deny`): quando `grounding.mode != off` e `grounding.blockWeb`, negar `tool_name ∈ {WebSearch, WebFetch}` com `permissionDecisionReason` instruindo a usar `mcp__<docsMcpServer>__search_docs`.

**[Review — isolamento, BLOQUEANTE p/ Execution]** O check de grounding deve ser um **ramo early, self-contained, só para tool_names de web** — avaliado ANTES (ou ao lado) da lógica de branch-protection existente, e que **retorna apenas para esses tools**. NUNCA pode alterar o caminho de `Edit`/`Write` nem o `deny` de config ausente (a branch-protection já existente fica byte-intacta). Config ausente / `grounding` ausente → `mode=off` → **não** bloqueia web (fail-open correto: grounding é opt-in; só projetos que ativaram bloqueiam).

**[Review — bypass, honestidade]** Bloquear `WebSearch`/`WebFetch` é **best-effort**: não cobre `Bash` rodando `curl`/`wget` nem MCPs de internet genéricos (apify, rag-web-browser, etc.). Fase 1 nega `WebSearch`/`WebFetch` **+ uma denylist configurável de padrões de tool-name de MCP de internet** (`grounding.blockToolPatterns: [...]`). `Bash` com `curl`/`wget` fica como **gap residual documentado** (hardening opcional posterior: grep de comando de rede no Bash). Isso é coerente com a honestidade do §2 — o enforcement reduz, não zera.

### 5b. Diretiva — `hooks/session-start` (injeção de contexto)
Quando `grounding.mode != off`, injeta um bloco `<GROUNDING_MODE>` no contexto (mesmo mecanismo que injeta o DevFlow context), declarando: o modo ativo, o server canônico, o protocolo de resposta (§5d), e o fail-closed. Assim a regra entra como instrução de alta prioridade em toda sessão.

### 5c. Protocolo de resposta (skill/diretiva)
Define o "answer-gate" para afirmações de stack:
1. `search_docs`/`find_version` no `docsMcpServer` **antes** de afirmar.
2. Achou → responder **citando** `lib@versão` + trecho.
3. Vazio/timeout/down → em `docs-only`: dizer "não há doc indexada/o MCP falhou — não vou responder de memória" e **parar** (ou oferecer indexar via `/devflow:scrape-stack-batch`). Em `docs-first`: complementar com disclosure explícito.

### 5d. Auditoria opcional — `hooks/post-tool-use`
(Fase 2, opcional) registra em telemetria quando uma resposta de stack foi dada sem um `search_docs` prévio na sessão — sinal de drift para o usuário, não bloqueio.

### 5e. UX de ativação — `devflow:config` + `devflow:project-init`
- `devflow:config`: nova pergunta na entrevista ("Ativar doc-grounding obrigatório? off/docs-first/docs-only") + qual server canônico (detecta os `mcp__*docs*` disponíveis e lista — resolve a ambiguidade dos 2 servers do §8). Escreve a seção `grounding:`.
- `devflow:project-init`: inclui a pergunta no fluxo inicial (default `off`).

### 5f. Doctor — `devflow:doctor`
Quando `grounding.mode != off`, checa que `docsMcpServer` está **conectado e responde** (`list_libraries`). Se o modo é `docs-only` e o server está down, avisa que **tudo** vira fail-closed (para o usuário não ficar sem respostas sem entender por quê).

## 6. Integração com `std-grounding`
O `std-grounding` (universal, prose-only) ganha um parágrafo apontando que, quando `grounding.mode != off`, a regra "nunca confie só em memória" passa a valer **também para stack externo** com enforcement via hook + MCP. Não duplica; cross-ref.

## 7. Faseamento (TDD)
| Fase | Entrega | Teste |
|---|---|---|
| 1 | Schema `grounding:` + leitura no `pre-tool-use` + bloqueio de WebSearch/WebFetch | hook nega web com `mode=docs-only`, permite com `off` |
| 2 | Injeção `<GROUNDING_MODE>` no `session-start` + protocolo de resposta documentado | session-start emite o bloco quando ativo; ausente quando `off` |
| 3 | Pergunta no `devflow:config` + `project-init` (default off) | config escreve a seção; idempotente |
| 4 | Check no `devflow:doctor` + parágrafo no `std-grounding` | doctor detecta server down em modo ativo |
| 5 | ADR + CHANGELOG + docs | ADR audit; release |

## 8. Decisão pendente — qual MCP é canônico (liga ao incidente real)
Há **dois** servers docs-mcp-server no setup: `mcp__docs-mcp-server` (tem odoo-12/17/18) e `mcp__plugin_devflow_docs-mcp-server` (tem outras libs, não odoo). O `docsMcpServer` no config precisa nomear **qual** é a fonte. Sugestão: a pergunta do `config` lista os servers `*docs*` conectados e o usuário escolhe; o doctor valida.

## 9. Riscos
| Risco | Mitigação |
|---|---|
| Fail-closed deixa o agente "mudo" se o MCP cair | Doctor avisa; `docs-first` como meio-termo; mensagem clara em vez de silêncio |
| Bloquear web quebra tarefas legítimas não-stack | Bloqueio só de WebSearch/WebFetch; o agente ainda usa Read/Grep/MCP; usuário pode `off` por sessão |
| Falsa sensação de "conhecimento desligado" | §2 documenta o limite honestamente; enforcement real é web+citação+fail-closed |
| Drift entre o server scrapeado e o consumido | Doctor cruza `docsMcpServer` com o que está indexado |

## 10. Critérios de aceitação
- [ ] `grounding:` em `.devflow.yaml`, default `off`, escrito pelo config/init.
- [ ] `pre-tool-use` nega WebSearch/WebFetch quando `mode != off` + `blockWeb`; permite em `off`.
- [ ] `session-start` injeta `<GROUNDING_MODE>` com protocolo + fail-closed quando ativo.
- [ ] `doctor` valida o `docsMcpServer` em modo ativo.
- [ ] Honestidade de escopo (§2) refletida na diretiva — não promete supressão total de treino.
- [ ] Tudo em pt-BR; testes por fase verdes.
