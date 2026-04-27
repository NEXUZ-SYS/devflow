# Catálogo de Padrões Nomeados

Arquivo de referência consumido pelo **Check 11** do modo AUDIT (ver `references/auditoria.md`).

## Sobre este catálogo

Este arquivo é **substituível por organização**. Cada time que adota a skill pode manter seu próprio catálogo de padrões state-of-art nomeados. O conteúdo default abaixo vem de uma base de código real (multi-tenant SaaS com camada de protocolo MCP) e é um exemplo concreto — não uma prescrição. Times em outros domínios devem substituir pelos padrões que são canônicos em seu próprio sistema.

**Como substituir para outra organização:**

1. Manter o nome do arquivo (`patterns-catalog.md`) — a skill espera este path exato.
2. Manter a estrutura por padrão: `### <Nome>` → `**Quando aplicar:**` → `**Sintomas paráfrase:**` → `**Guardrail típico:**`. O Check 11 consome essa estrutura.
3. Substituir os 6 padrões default pelos seus. Podem ser mais ou menos — 3 a 10 padrões é uma faixa saudável.
4. Remover esta seção "Sobre este catálogo" e esta nota se preferir — a skill não depende dela.

## Filosofia

Quando uma ADR descreve um padrão técnico já conhecido pelo nome canônico na comunidade ou no código-base do time, ela deve **nomear o padrão explicitamente** no Contexto ou Decisão — não apenas descrever o comportamento. Nomes canônicos são gatilhos semânticos mais fortes que paráfrases; um leitor técnico (humano ou IA) reconhece o padrão pelo nome mais rápido do que pela descrição.

O Check 11 não é prescritivo — descrições técnicas podem coincidir com o vocabulário abaixo por coincidência. A classificação sempre é `FIX-INTERVIEW`: a skill pergunta ao autor se deve nomear o padrão ou se é terminologia paralela.

## Padrões (catálogo default · 6 padrões)

### Canonical isolation

**Quando aplicar:** decisões sobre isolamento de dados multi-tenant onde o identificador canônico carrega o tenant no próprio formato, permitindo checagem estrutural de cross-tenant leaks em tempo de query.

**Sintomas paráfrase:** "garantimos que cada tenant só acessa seus próprios dados", "prefixamos IDs com o identificador do cliente para isolamento".

**Guardrail típico:** SEMPRE validar que o tenant-prefix do canonical ID bate com o tenant do request antes de executar query.

### Triple-tenant

**Quando aplicar:** arquitetura de multi-tenancy em três camadas — tenant lógico do produto (cliente), tenant de deploy (instância), tenant de dado (banco/schema). Todas as três dimensões explicitadas no contrato de acesso.

**Sintomas paráfrase:** "separação de clientes por instância e por schema", "cliente tem seu próprio deploy e seu próprio banco".

**Guardrail típico:** SEMPRE logar as três dimensões de tenancy (client, deploy, data) em toda operação de acesso a dados.

### BYOK (Bring Your Own Key)

**Quando aplicar:** decisões sobre criptografia em repouso ou em trânsito onde a chave não pertence ao provedor do serviço — o cliente traz e rotaciona a própria chave, e o serviço nunca consegue decifrar sem ela.

**Sintomas paráfrase:** "o cliente gerencia suas próprias chaves", "não temos acesso aos dados criptografados do cliente".

**Guardrail típico:** NUNCA persistir a chave do cliente em nenhum storage próprio; SEMPRE exigir chave no request para operações sobre dados cifrados.

### RFC 7807 (Problem Details)

**Quando aplicar:** decisões sobre formato de erro em APIs HTTP. RFC 7807 define o content-type `application/problem+json` com campos padronizados (`type`, `title`, `status`, `detail`, `instance`).

**Sintomas paráfrase:** "padronizamos erros em JSON estruturado com código, tipo e descrição", "retornamos erro em formato consistente com tipo e status".

**Guardrail típico:** SEMPRE retornar erros HTTP 4xx/5xx em `application/problem+json` conforme RFC 7807.

### Canonical IDs

**Quando aplicar:** decisões sobre formato de identificadores onde o ID carrega metadado estrutural (tenant, tipo, versão) no próprio formato, em vez de ser opaco (UUID puro).

**Sintomas paráfrase:** "IDs com prefixo indicando tipo", "identificador que mostra de qual sistema vem".

**Guardrail típico:** SEMPRE gerar IDs via função central que garante o formato canônico; NUNCA aceitar IDs opacos em endpoints públicos.

### Inflight coalescing

**Quando aplicar:** padrão de deduplicação de requests idênticos em vôo — quando N requests idênticos chegam antes do primeiro completar, apenas um executa e os demais aguardam o resultado compartilhado.

**Sintomas paráfrase:** "evitamos processar a mesma operação N vezes quando chega em rajada", "deduplicamos chamadas idênticas concorrentes".

**Guardrail típico:** QUANDO request duplicado em vôo, ENTÃO aguardar resultado compartilhado em vez de disparar nova execução.

## Como o Check 11 usa este arquivo

Para cada padrão listado acima:

1. Procurar no ADR auditado por menções ao **nome canônico** (ex: "canonical isolation", "RFC 7807").
2. Se o nome aparece → PASS para este padrão.
3. Se o nome não aparece, procurar por **sintomas paráfrase** nos campos Contexto e Decisão.
4. Se sintomas encontrados sem nome → FIX-INTERVIEW ("A ADR descreve comportamento próximo ao padrão X. É o mesmo? Se sim, nomeie explicitamente.").
5. Se nem nome nem sintomas → padrão não aplicável, seguir.

O Check 11 é **conservador por design**: sempre pergunta, nunca corrige sozinho.
