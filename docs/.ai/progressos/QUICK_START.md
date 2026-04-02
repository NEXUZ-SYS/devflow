# Guia Rápido - Comandos de Progresso

Este guia mostra como usar os comandos customizados para registrar seu trabalho.

## 🚀 Início Rápido

### 1. Configure sua branch

```bash
# Criar branch seguindo o padrão
git checkout -b feat/oauth-integration

# Ou para estórias específicas
git checkout -b feat/oauth-integration-01
```

### 2. Trabalhe normalmente

```bash
# Faça suas alterações
vim src/auth/oauth.py

# Teste suas mudanças
pytest tests/test_auth.py
```

### 3. Registre seu progresso

```bash
# Ao finalizar, use o comando /commit no Claude Code
/commit
```

O Claude vai:

- ✅ Detectar automaticamente a Sprint "oauth-integration"
- ✅ Buscar a Sprint no Notion
- ✅ Pedir informações (mensagem, tags, horas)
- ✅ Criar o commit Git
- ✅ Registrar no Notion
- ✅ Salvar documentação local

---

## 📋 Workflows Comuns

### Workflow 1: Desenvolvimento de Feature

```bash
# 1. Criar branch
git checkout -b feat/nova-funcionalidade

# 2. Desenvolver
# ... código ...

# 3. Registrar commit
/commit
> Mensagem: "feat(produto): adicionar validação de estoque"
> Tags: feature
> Horas: 3.5

# 4. Continuar desenvolvendo
# ... mais código ...

# 5. Outro commit
/commit
> Mensagem: "feat(produto): implementar testes de validação"
> Tags: feature, test
> Horas: 2.0

# 6. Ao final do dia
/daily-summary
> Destaques: "Implementação completa da validação de estoque"
> Próximos passos: "Integrar com API externa"
```

### Workflow 2: Correção de Bug

```bash
# 1. Criar branch
git checkout -b fix/bug-calculo-preco

# 2. Investigar
/progress
> Tipo: Research
> Título: "Investigação do bug de cálculo de preço"
> Status: Em Execução
> Tags: bug-fix
> Horas: 1.5

# 3. Corrigir
# ... código ...

/commit
> Mensagem: "fix(vendas): corrigir cálculo de desconto progressivo"
> Tags: bug-fix
> Horas: 2.0

# 4. Registrar conclusão
/progress
> Tipo: Milestone
> Título: "Bug de cálculo corrigido e testado"
> Status: Concluído
> Tags: bug-fix, test
> Horas: 0.5
```

### Workflow 3: Estória com Múltiplas Tarefas

```bash
# Estória principal: "Implementar módulo de autenticação"

# Tarefa 1: Setup
git checkout -b feat/auth-module-01

/progress
> Tipo: Planning
> Título: "Planejamento da arquitetura OAuth 2.0"
> Status: Concluído
> Tags: planning, feature
> Horas: 2.0

# Tarefa 2: Implementação
/commit
> Mensagem: "feat(auth): implementar endpoints de autenticação"
> Tags: feature, security
> Horas: 4.0

/commit
> Mensagem: "feat(auth): adicionar refresh token"
> Tags: feature, security
> Horas: 2.5

# Tarefa 3: Testes
/commit
> Mensagem: "test(auth): adicionar testes de integração OAuth"
> Tags: test, security
> Horas: 3.0

# Conclusão
/progress
> Tipo: Milestone
> Título: "Módulo de autenticação OAuth 2.0 completo"
> Status: Concluído
> Tags: feature, security
> Horas: 0.5

/daily-summary
```

---

## 🎯 Boas Práticas

### Commits Frequentes

```bash
# ❌ NÃO: Um único commit gigante no final do dia
git commit -m "mudanças do dia"

# ✅ SIM: Commits pequenos e focados
/commit  # "feat(auth): adicionar validação de token"
/commit  # "feat(auth): implementar refresh token"
/commit  # "test(auth): adicionar testes unitários"
```

### Tags Descritivas

```bash
# Use tags que facilitam filtros no Notion
/commit
> Tags: feature, security          # Feature relacionada à segurança
> Tags: bug-fix, performance       # Bug fix que melhora performance
> Tags: refactor, docs             # Refatoração com documentação
```

### Horas Realistas

```bash
# Seja honesto com as horas trabalhadas
/commit
> Horas: 2.5  # ✅ Incluindo tempo de pesquisa e testes
> Horas: 0.5  # ✅ Apenas um pequeno ajuste
> Horas: 6.0  # ✅ Implementação complexa
```

### Daily Summary Completo

```bash
/daily-summary

# Forneça contexto útil:
> Destaques: "Implementação completa do OAuth 2.0, incluindo testes"
> Desafios: "Dificuldade com refresh token, resolvido via documentação oficial"
> Próximos passos: "Integrar com frontend, adicionar UI de login"
```

---

## 📊 Acompanhando Progresso

### No Notion

1. Acesse a database **Progressos**
2. Filtre por Sprint ou Estória
3. Visualize no Kanban por Status
4. Agrupe por Tags para ver padrões

### Localmente

```bash
# Ver progressos do dia
ls -la .ai/progressos/2025-01-22-*

# Buscar por tag
grep -r "feature" .ai/progressos/

# Ver resumos diários
ls -la .ai/progressos/*-daily-summary.md
```

---

## 🔍 Troubleshooting

### Comando não encontra Sprint

```bash
# Verifique o nome da branch
git branch --show-current

# Se necessário, renomeie
git branch -m feat/nome-correto-da-sprint

# Ou especifique manualmente quando o Claude perguntar
```

### Esqueci de registrar progresso

```bash
# Use /progress para registrar retroativamente
/progress
> Tipo: Manual Note
> Título: "Implementação não registrada: endpoint /users"
> Data/Hora: [forneça data/hora aproximada]
```

### Preciso editar um progresso

1. Encontre a página no Notion
2. Edite diretamente
3. Ou use `/progress` para adicionar nota complementar

---

## 📚 Recursos

- **Comandos**: `.claude/commands/`
- **Database Reference**: `.ai/notion-databases-reference.md`
- **Objetivo**: `.ai/templates/objetivo_template.md`

---

**Dica**: Execute `/daily-summary` ao final de cada dia para manter um histórico consistente e facilitar relatórios futuros!
