---
id: std-grounding
description: Toda referência a arquivo, símbolo ou API é verificada no código real antes de usar
version: 1.1.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- Verifique antes de escrever: confirme existência de arquivo, símbolo, hook ou tipo com Read/Grep/Glob antes de referenciar
- Versões e APIs mudam — confirme em `package.json`, lockfile ou docs locais; nunca confie apenas em memória de treinamento
- Quando não há evidência, diga "não encontrei" em vez de inventar caminho plausível
- Erros do usuário ("não funcionou") são sintomas — peça log/output real antes de hipotetizar a causa
- Não copie nome de função de exemplo genérico para o projeto sem verificar se existe lá
- Incerteza é declarada, não disfarçada: prefira "acho que existe, mas vou verificar" a "existe em X"
- Env vars e config: confirme no schema de validação ou `.env.example` antes de referenciar
- Toda referência a `@contexts/...` aponta para arquivo que realmente existe no repo
- Verificação precede geração: nenhum import, tipo, hook, env var ou path é escrito antes de confirmado por Read/Grep/Glob
- Ao usar API de uma lib, confirme a versão instalada e o que essa versão suporta — APIs mudam entre majors

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `import { useAuth }` sem verificar se o hook existe | `Glob "**/hooks/use-auth.*"` antes de importar |
| "O `UserService.create` faz X" sem ler o arquivo | Read do arquivo para confirmar assinatura |
| Sugerir `src/lib/foo.ts` "típico" sem verificar layout | `Glob "**/lib/foo*"` para descobrir onde realmente fica |
| `process.env.STRIPE_KEY` sem confirmar no schema | `Grep` no schema de env ou `.env.example` primeiro |
| Opção de config "que o framework normalmente tem" | Confirmar nos tipos da versão instalada |
| Função chamada que Grep não encontra | Declarar a incerteza e pedir ao usuário para confirmar |
