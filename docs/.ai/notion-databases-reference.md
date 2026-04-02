# 📚 Referência Rápida - Databases Notion

**Última atualização:** 2025-01-22

Este documento fornece referência rápida para as databases do Notion usadas no workflow de desenvolvimento.

---

## 🔄 Fluxo de Rastreabilidade

```
🎯 Épico → 🏃‍♂️ Sprint → ➡️ Estória → 📓 Progresso → 🔗 Commit Git
                ↓
         📄 PRD + ADRs
```

---

## 📓 Database: Progressos

### Objetivo
Diário de execução técnica que registra commits, resumos diários, marcos e notas importantes.

### Acesso
- **URL**: https://www.notion.so/nexuz/29415efd475d8078a6e7f20ad417f5fa
- **Database ID**: `29415efd475d8078a6e7f20ad417f5fa`
- **Collection ID**: `29415efd-475d-80a5-a264-000bb8f7d4ec`

### Campos Principais
| Campo | Tipo | Descrição |
|-------|------|-----------|
| **Nome** | Title | Descrição curta do progresso |
| **Tipo** | Select | Commit, Daily Summary, Milestone, Manual Note |
| **Data/Hora** | Date | Timestamp do progresso |
| **Autor** | Person | Quem fez o progresso |
| **Status da Execução** | Select | Planejado, Em Execução, Concluído, Bloqueado |
| **Estória** | Relation | Estória relacionada (1:1) |
| **Sprint** | Relation | Sprint relacionada (1:1) |
| **Épico** | Rollup | Via Sprint → Épico |
| **Branch** | Text | Nome da branch Git |
| **Commit Hash** | Text | Hash curto (8 chars) |
| **Commit URL** | URL | Link do commit |
| **Horas Trabalhadas** | Number | Tempo dedicado |
| **Tags** | Multi-select | bug-fix, feature, refactor, docs, test, etc. |

### Relações
- **Estória** ↔ Estórias.Progressos
- **Sprint** ↔ Sprints.Progressos da Sprint

---

## ➡️ Database: Estórias

### Objetivo
Tasks específicas derivadas do PRD, com execução clara e granular.

### Acesso
- **URL**: https://www.notion.so/nexuz/c952482478714bc58a2d6f09d2f9eff6
- **Database ID**: `c952482478714bc58a2d6f09d2f9eff6`
- **Collection ID**: `d8b106a2-daea-48cd-a694-f55cca17e5ad`

### Campos Principais
| Campo | Tipo | Descrição |
|-------|------|-----------|
| **Nome** | Title | Título da estória |
| **Status** | Status | Não iniciado → Em progresso → Concluído |
| **Tipo** | Select | Bug, Funcionalidade, Documentação, etc. |
| **Sprint** | Relation | Sprint pai (1:1) |
| **Épicos** | Relation | Épicos relacionados |
| **Responsável** | Person | Pessoa responsável |
| **Prioridade** | Select | Baixa, Média, Alta, Muito Alta |
| **Data de inicio** | Date | Data de início |
| **Prazo de conclusão** | Date | Deadline |
| **Progressos** | Relation | Progressos vinculados |
| **Branch Específica** | Text | Branch da estória |
| **Story Points** | Number | Estimativa Fibonacci |
| **Tempo Estimado** | Number | Horas estimadas |
| **Tempo Real** | Rollup | Soma de Horas Trabalhadas (Progressos) |
| **Commits Relacionados** | Rollup | Contagem de Progressos tipo Commit |
| **Dependência** | Relation | Estórias dependentes |
| **Impedido por** | Relation | Estórias bloqueadoras |

### Relações
- **Sprint** ↔ Sprints.Estória
- **Épicos** ↔ Épicos.Estórias
- **Progressos** ↔ Progressos.Estória

---

## 🏃‍♂️ Database: Sprints

### Objetivo
Unidade tática de execução. Contém PRD, ADRs, vincula Estórias e rastreia progresso.

### Acesso
- **URL**: https://www.notion.so/nexuz/6644012a77cc40388377df93bcc9f6fe
- **Database ID**: `6644012a77cc40388377df93bcc9f6fe`
- **Collection ID**: `7d6aa486-bcd3-4465-90a2-9603d15f4203`

### Campos Principais
| Campo | Tipo | Descrição |
|-------|------|-----------|
| **Nome** | Title | Nome da sprint |
| **Status** | Status | Não iniciado → Em progresso → Concluído |
| **Épico** | Relation | Épico pai (limite 1) |
| **Responsável** | Person | Pessoa(s) responsável(is) |
| **Departamento** | Select | Comercial, Administrativo, Relacionamento, Desenvolvimento |
| **Prioridade** | Select | Baixa, Média, Alta |
| **Período** | Date Range | Data início e fim |
| **Estória** | Relation | Estórias da sprint |
| **PRD** | Relation | Documento PRD (Central de documentos) |
| **ADRs** | Relation | Documentos ADR (Central de documentos) |
| **Branch Principal** | Text | Nome da branch Git |
| **Tipo da Sprint** | Select | feat, fix, docs, refactor, test, config |
| **Progressos da Sprint** | Relation | Progressos gerais |
| **% Conclusão Estórias** | Rollup | Percentual de Estórias concluídas |
| **Última Atividade** | Rollup | Data do último Progresso |

### Relações
- **Épico** ↔ Épicos.Sprints
- **Estória** ↔ Estórias.Sprint
- **PRD** ↔ Central de documentos.Sprints Relacionadas
- **ADRs** ↔ Central de documentos.Sprints Relacionadas
- **Progressos da Sprint** ↔ Progressos.Sprint

---

## 🎯 Database: Épicos

### Objetivo
Grandes objetivos ou temas de produto. Origem estratégica das Sprints e PRDs.

### Acesso
- **URL**: https://www.notion.so/nexuz/48f7737e4e9e497c8ba4fd841e71fe08
- **Database ID**: `48f7737e4e9e497c8ba4fd841e71fe08`
- **Collection ID**: `51a3d932-1425-4ee3-99d4-a26b4c4316b5`

### Campos Principais
| Campo | Tipo | Descrição |
|-------|------|-----------|
| **Nome** | Title | Título do épico |
| **Status** | Status | Backlog → Em planejamento → Em progresso → Concluído |
| **Responsável** | Person | Pessoa(s) responsável(is) |
| **Departamento** | Select | Comercial, Administrativo, Relacionamento, Desenvolvimento |
| **Prioridade** | Select | Baixa, Média, Alta |
| **Período** | Date Range | Data início e fim planejados |
| **Classificação** | Select | Projeto, Ticket |
| **Estórias** | Relation | Estórias relacionadas |
| **Sprints** | Relation | Sprints relacionadas |
| **Metas** | Relation | Metas relacionadas |
| **% Conclusão** | Rollup | Percentual de Estórias concluídas |

### Relações
- **Estórias** ↔ Estórias.Épicos
- **Sprints** ↔ Sprints.Épico
- **Metas** ↔ Metas.Épicos

---

## 📄 Database: Central de Documentos

### Objetivo
Repositório central de PRDs, ADRs e documentação de produto.

### Acesso
- **URL**: https://www.notion.so/nexuz/20215efd475d80aea7a3d8e3fa3eb98f
- **Database ID**: `20215efd475d80aea7a3d8e3fa3eb98f`
- **Collection ID**: `20215efd-475d-80d2-b0e1-000b2f637211`

### Campos Principais
| Campo | Tipo | Descrição |
|-------|------|-----------|
| **Nome do documento** | Title | Título do documento |
| **Status** | Status | Rascunho → Em construção → Pronto para uso |
| **Categoria** | Multi-select | Proposal, PRD, ADR, Pesquisa, Estratégia, etc. |
| **Departamento** | Multi-select | Comercial, Administrativo, Relacionamento, Desenvolvimento |
| **Sprints Relacionadas** | Relation | Sprints vinculadas |
| **Revisores** | Person | Pessoas que devem revisar |
| **Link de apoio** | URL | Link externo de referência |

### Categorias Importantes
- **PRD**: Product Requirements Document (1:1 com Sprint)
- **ADR**: Architecture Decision Record (1:N com Sprint)

### Relações
- **Sprints Relacionadas** ↔ Sprints.PRD / Sprints.ADRs

---

## 🛠️ Uso com MCP

### Buscar Database

```typescript
// Usando URL
mcp__notion__notion-fetch({
  id: "https://www.notion.so/nexuz/29415efd475d8078a6e7f20ad417f5fa"
})

// Usando Database ID
mcp__notion__notion-fetch({
  id: "29415efd475d8078a6e7f20ad417f5fa"
})
```

### Atualizar Database

```typescript
mcp__notion__notion-update-database({
  database_id: "29415efd475d8078a6e7f20ad417f5fa",
  properties: {
    // Adicionar ou modificar campos
  }
})
```

### Criar Página (Progresso)

```typescript
mcp__notion__notion-create-pages({
  parent: {
    database_id: "29415efd475d8078a6e7f20ad417f5fa"
  },
  pages: [{
    properties: {
      "Nome": "Implementação do endpoint /auth/token",
      "Tipo": "Commit",
      "date:Data/Hora:start": "2025-01-22T14:30:00",
      "date:Data/Hora:is_datetime": 1,
      "Horas Trabalhadas": 3,
      "Branch": "feat/oauth-integration",
      "Commit Hash": "a3f5c21",
      "Status da Execução": "Concluído"
    },
    content: "# Resumo\n\nImplementado endpoint POST /auth/token..."
  }]
})
```

### Buscar com Filtros

```typescript
mcp__notion__notion-search({
  query: "OAuth",
  query_type: "internal",
  filters: {
    created_date_range: {
      start_date: "2025-01-01"
    }
  }
})
```

---

## 📊 Queries Úteis

### Estórias Bloqueadas
```
Filtro: "Impedido por" is not empty
Database: Estórias (c952482478714bc58a2d6f09d2f9eff6)
```

### Sprints sem Progresso (7 dias)
```
Filtro: Status = "Em progresso" AND "Última Atividade" < hoje - 7 dias
Database: Sprints (6644012a77cc40388377df93bcc9f6fe)
```

### Progressos da Semana
```
Filtro: "Data/Hora" >= hoje - 7 dias
Database: Progressos (29415efd475d8078a6e7f20ad417f5fa)
```

### Épicos Ativos
```
Filtro: Status != "Concluído" AND Status != "Cancelado"
Database: Épicos (48f7737e4e9e497c8ba4fd841e71fe08)
```

---

## 📝 Notas

- **Database ID**: Use para operações via MCP (`notion-update-database`, `notion-create-pages`)
- **Collection ID**: Aparece nas queries SQL e relações entre databases
- **URL**: Use para acesso direto no navegador ou `notion-fetch`

Para especificação completa e detalhada, consulte `notion-databases-spec.md`.
