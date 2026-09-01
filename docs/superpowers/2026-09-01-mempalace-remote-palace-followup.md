# Follow-up: palace remoto compartilhado do MemPalace

**Data:** 2026-09-01
**Origem:** decisão D10 da spec `2026-09-01-daily-devflow-checkup-design.md`
**Status:** registrado, não iniciado — precisa de spec própria

## O problema

Um mantenedor que clona o repositório num dispositivo novo não tem memória de longo prazo. O
MemPalace vive fora do repositório e não é replicável por clone.

O checkup de início de dia (`mempalace-env`, Task 10) passa a **detectar** isso — hoje o
`mempalace-health` devolve `OK` com "não instalado — nada a checar", verde sobre a ausência
total. Mas detectar não é resolver: o mantenedor descobre que não tem memória e continua sem ela,
porque a única saída é rodar `mempalace init` e começar um palace vazio.

## Por que "um palace por projeto" não resolve

O binário aceita `--palace PATH`, então isolar por projeto é tecnicamente possível. Não ajuda:

| Fato | Consequência |
|---|---|
| O palace é ChromaDB + SQLite (binário) | não é versionável |
| 433 MB na máquina de referência (2026-09-01) | inviável no git mesmo se fosse texto |
| 25.538 drawers, 8.166 só em `devflow/documentation` | cresce com o uso, não estabiliza |

Um palace por projeto reduz o tamanho e isola contextos, mas continua **não vindo no clone** — o
dispositivo novo segue sem memória. Resolve isolamento, não replicação.

## O que resolveria

O próprio binário oferece o caminho:

```
serve    Run a secure remote HTTP MCP server for a team to share one palace
```

Um palace remoto compartilhado é alcançável de qualquer dispositivo pelo `.mcp.json`, que **é**
versionado. O padrão já existe neste repositório — só que apenas para documentação:

| Server | Configuração atual |
|---|---|
| `docs-mcp-server` | `{"type": "http", "url": "https://docs-mcp.nexuz.app/mcp"}` |
| `mempalace` | `{"command": "mempalace-mcp", "args": []}` |

Migrar o segundo para a forma do primeiro é o que torna a memória de longo prazo um recurso do
projeto, e não da máquina.

## O que a spec precisa resolver

1. **Hospedagem** — onde roda o `mempalace serve`. O `docs-mcp.nexuz.app` é precedente de infra.
2. **Autenticação** — o que "secure" significa na prática, e como a credencial chega ao
   `.mcp.json` sem virar segredo versionado.
3. **Migração** — como levar os 433 MB / 25.538 drawers existentes para o palace remoto sem perda,
   e o que fazer com as wings de outros projetos (`docs-mcp-server`, `frappe_docker`) que
   compartilham o mesmo palace global.
4. **Escopo por wing** — hoje uma wing por projeto num palace só. Num palace compartilhado por
   time, decidir se a separação continua por wing ou vira palace por projeto.
5. **Modo degradado** — o que acontece quando o palace remoto está fora do ar. O checkup jamais
   deve travar uma sessão, e o `mempalace` local hoje é o caminho quente do SessionStart.
6. **Custo e latência** — o auto-recall roda no SessionStart com orçamento de 1000 tokens; uma
   chamada de rede ali entra no caminho crítico de toda sessão.

## Relação com o checkup diário

Independente. O `mempalace-env` detecta a ausência e diz o que fazer; o palace remoto muda **o que**
ele diria. Se um dia o palace virar remoto, o check passa a validar alcançabilidade do endpoint em
vez de existência de diretório — mudança de conteúdo do check, não de arquitetura do checkup.
