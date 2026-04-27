# Extração em Modo Livre

Use este roteiro quando o usuário pedir para criar um ADR a partir de **conversa livre**
— ou seja, quando ele já descreveu a decisão em prosa e não quer ser entrevistado passo a passo.

## Fluxo

1. **Leia toda a mensagem do usuário** e extraia o que der para o template.
2. **Identifique o que está faltando** (campos sem informação).
3. **Faça UMA rodada de perguntas** sobre os buracos — agrupadas, não mais de 4-5 perguntas por vez.
4. **Gere o ADR** preenchendo com `<a definir>` o que ainda estiver faltando após a rodada.

## Campos e como extraí-los da prosa

| Campo | Como extrair | Se faltar |
|---|---|---|
| **Título / nome** | Primeira frase afirmativa do tipo "vamos usar X para Y" | Pergunte |
| **Escopo** | Inferir do contexto: menciona empresa/time = organizational; menciona projeto específico = project | Pergunte |
| **Stack** | Menções diretas a linguagens/frameworks | Marque como `universal` se não houver |
| **Version** | Sempre `0.1.0` em ADR nova (semver do documento, não da stack) | Não perguntar — preencher automaticamente |
| **Supersedes** | Usuário mencionou explicitamente "substitui a ADR X"? | Deixar `[]` quando não mencionado — nunca inferir |
| **Refines** | Usuário mencionou explicitamente "refina/detalha a ADR X" ou a decisão é SLO/política sobre arquitetura existente? | Deixar `[]` quando não mencionado — nunca inferir |
| **Protocol contract** | Quando `category: protocol-contracts`, extrair nome + versão do contrato (ex: "PosV1", "MCP 0.3") | `null` em qualquer outra categoria |
| **Decision kind** | Usuário falou "vamos reavaliar em N meses" / "experimento" / "se não der certo revertemos"? | Default `firm`. `gated` se há portão explícito; `reversible` se é experimento |
| **Categoria** | Inferir do tema — ver mapeamento abaixo | Pergunte se ambíguo |
| **Contexto** | Toda a parte "porque", "estamos com problema de", "atualmente" | Pergunte se a mensagem for curta demais |
| **Decisão** | A frase-chave "vamos fazer", "escolhemos", "a ideia é" | Reformule em voz ativa afirmativa |
| **Preservações** | Menções a "mantemos X", "o Y fica como está", "não mexemos no Z" — sinal de brownfield | Omitir a seção quando não aplicável (seção opcional) |
| **Alternativas** | "Pensamos em X mas...", "comparamos com Y", "ao invés de Z" | **Sempre pergunte** — é o campo mais sonegado |
| **Consequências** | "Isso vai nos permitir", "o custo é", "a desvantagem é" | Pergunte positivas E negativas |
| **Guardrails** | Raramente vêm na prosa inicial | **Sempre pergunte** — peça regras verificáveis |
| **Enforcement** | Idem | **Sempre pergunte** — mínimo 1 mecanismo |

## Mapeamento de categorias (inferência)

- `principios-codigo` — palavras-chave: convenção, padrão de código, estilo, nomenclatura, formatação, linter, clean code
- `qualidade-testes` — palavras-chave: teste, cobertura, TDD, CI de testes, mock, fixture
- `arquitetura` — palavras-chave: framework, biblioteca, padrão arquitetural, estrutura, camadas, DDD, microserviço
- `seguranca` — palavras-chave: auth, JWT, RBAC, criptografia, secret, vulnerabilidade, compliance
- `infraestrutura` — palavras-chave: deploy, CI/CD, cloud, observabilidade, log, métrica, kubernetes, container
- `protocol-contracts` — palavras-chave: MCP, schema canônico, contrato de API, versionamento de protocolo, RS/AS split, event schema, RFC 7807, canonical IDs, BYOK, multi-tenant isolation
- `agent-harness` — palavras-chave: harness, agent loop, memory store, HITL, eval harness, tool-use loop, skill execution, Mastra, Deep Agents, PydanticAI, LangGraph

## Heurísticas importantes

**Se o usuário só trouxe a decisão sem contexto:**
> "Vamos usar FastAPI no backend novo."

Isso não é ADR — é uma declaração. Responda pedindo o mínimo:
- Por quê? (qual problema resolve)
- Quais outras opções consideraram?
- Quais regras/guardrails derivam disso?

**Se o usuário trouxe muito contexto mas sem decisão clara:**
> "Temos 3 devs, precisamos de tipagem forte, o time conhece Python, mas também já mexemos com Node..."

Pergunte explicitamente: "Qual foi a decisão final?" — ADR não é debate, é registro.

**Se o usuário misturou várias decisões em uma só:**
> "Vamos usar FastAPI, Pydantic pra validação, e Postgres como banco."

Ofereça separar em 3 ADRs. Decisões juntadas ficam impossíveis de revisar depois.

## Regras de conduta

- **Preserve as palavras do usuário** em citações quando possível, não reescreva tudo em "claudês".
- **Não invente alternativas consideradas.** Se o usuário só disse uma, pergunte; não preencha com plausíveis.
- **Não invente guardrails.** Eles devem vir do usuário — você pode *sugerir* candidatos a partir do contexto, mas peça confirmação.
- **Separe stack de produto.** Se o usuário descreveu a decisão misturando stack com funcionalidade de produto ou operação de negócio, extraia apenas a parte arquitetural. "Precisamos de cache porque os franqueados reclamam da lentidão no fechamento do mês" vira, no Contexto, "a camada X apresenta latência em operações de agregação; escolhemos cache para reduzir tempo de resposta" — sem mencionar franqueados, fechamento de mês ou qualquer detalhe operacional.
- **Evidências são apenas fontes oficiais.** Se o usuário colar links de Medium, dev.to, blogs ou tutoriais, **recuse e peça o equivalente oficial**. "Tem um post no Medium sobre como isso funciona" vira "você consegue apontar a doc oficial ou o RFC correspondente?".
- **Comprima ao extrair.** A prosa do usuário é input bruto — o ADR final deve ser gatilho semântico, não transcrição. Mira: 80-120 linhas totais, frases curtas em Contexto/Decisão, keywords em Consequências/Evidências, um único exemplo de código minimal (15-20 linhas). Se a frase do usuário explica um conceito técnico corrente (SRP, FSD, tree-shaking, RBAC, etc.), **reescreva removendo a explicação** — o leitor já sabe.
- **Se faltar informação crítica após a rodada de perguntas**, preencha com `<a definir>` e avise o usuário no final: "Marquei X, Y, Z como pendentes — preencha antes de abrir o PR."
