---
id: std-code-review
description: Revisão focada, com tom técnico, classificada por severidade
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- PR focado em um único objetivo: nunca misture refatoração, feature e bugfix no mesmo PR
- Limit de ~400 linhas de diff efetivo (excluindo lockfiles, snapshots e migrations declarativas); acima disso, divida em PRs sequenciais
- Autor: rode lint, type-check e testes localmente antes de abrir; remova `console.log`, `TODO` sem dono, código comentado e prints de debug
- Autor: faça self-review do próprio diff antes de marcar como pronto; comente trechos não-óbvios para o reviewer
- Classifique comentários por severidade: `blocker:`, `issue:`, `suggestion:`, `nit:`, `question:`, `praise:`
- `blocker:` apenas para problemas que impedem o merge (bug, falha de segurança, quebra de contrato, regressão)
- Fraseie em primeira pessoa do plural ou no código, não no autor: "podemos extrair", nunca "você esqueceu"
- Sempre proponha alternativa ao criticar; comentário que só aponta problema sem direção de solução é incompleto
- Nunca aprove com comentários `blocker:` não resolvidos; nunca aprove o próprio PR
- Decisões arquiteturais grandes não são discutidas no thread do PR — abra issue ou ADR e referencie

## Anti-patterns

| Errado | Corrija para |
|---|---|
| PR misturando feature + refactor + bugfix | Dividir em PRs separados por objetivo |
| Aprovar sem ter lido cada arquivo modificado | Pedir split se o PR é grande demais para revisar |
| "você fez errado aqui" | "podemos usar `Result<T>` aqui para deixar o caller tratar o erro" |
| Comentário que só aponta problema sem solução | `suggestion: considerar extração de função X` com exemplo |
| Thread de revisão sem resolução explícita | Resolver ou rebater com justificativa antes do merge |
| PR sem descrição do porquê | Escrever contexto no corpo do PR antes de abrir |
