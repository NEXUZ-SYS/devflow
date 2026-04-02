# Documentação Local - Sprint Context

Este diretório contém documentação local do desenvolvimento (pasta `.ai/`), incluindo:

## `context.md` - Contexto da Sprint Ativa

Arquivo principal que mantém o contexto da Sprint atual:

- Metadados (nome, tipo, branch, status, URLs)
- Resumo e objetivos
- Tasks/Estórias em formato checklist
- Histórico de atividades
- Métricas de progresso

**Importante**: Este arquivo é **privado** (não versionado) e específico para cada desenvolvedor/branch.

### Uso

O arquivo `context.md` é criado automaticamente ao executar:

```bash
/sprint-init
```

E é atualizado automaticamente pelos comandos:

- `/commit` - Adiciona commits ao histórico e marca tasks concluídas
- `/progress` - Registra milestones e atualiza status de tasks
- `/daily-summary` - Consolida atividades do dia

### Template

Para criar manualmente, use o template em `/.ai/templates/context_template.md`

## `progressos/` - Histórico de Progressos

Diretório que armazena documentos de progresso:

- Commits individuais: `{YYYY-MM-DD}-{hash}.md`
- Resumos diários: `{YYYY-MM-DD}-daily-summary.md`
- Milestones e notas: `{YYYY-MM-DD}-{slug}.md`

**Importante**: Todos os arquivos nesta pasta são criados localmente PRIMEIRO e depois sincronizados com o Notion mediante aprovação.

## `estorias/` - Estórias da Sprint

Diretório que armazena as estórias (user stories) da sprint:

- Formato: `{numero}-{slug}.md` (ex: `01-criar-endpoint-auth.md`)
- Criadas pelo comando `/story-create`
- **OBRIGATÓRIO**: Todas as estórias devem ter arquivo local antes de ir para o Notion
- Sincronizadas com Notion após aprovação do usuário

**Versionamento**: Opcionalmente versionado no Git (configurável via `.gitignore`)

## `prd.md` - Product Requirements Document

Arquivo que contém o PRD da Sprint atual:

- Criado pelo comando `/prd`
- Salvo localmente ANTES de ser criado no Notion
- Vinculado automaticamente à Sprint
- Deve ter status "Pronto para uso" antes de criar estórias

## `prp.md` - Project Requirements Planning

Arquivo que contém o planejamento de projetos completos:

- Criado pelo comando `/prp`
- Define fases, épicos, sprints e cronograma
- Útil para projetos grandes com múltiplos épicos

## `.config.json` - Configurações Locais

Arquivo JSON com configurações locais (NÃO versionado):

```json
{
  "version": "1.0",
  "convidados": [],
  "preferencias": {
    "auto_sync_notion": true,
    "versionar_estorias": false
  },
  "cache": {},
  "updated_at": "2025-01-31T00:00:00Z"
}
```

- Armazena usuários convidados selecionados
- Preferências de sincronização
- Cache de dados

---

## Fluxo de Trabalho

**Princípio Central**: Todo arquivo é criado localmente PRIMEIRO, depois sincronizado com Notion após aprovação.

### 1. Inicializar Sprint
```bash
/sprint-init
```
- Cria `context.md`
- Cria Sprint no Notion
- Status inicial: "Não iniciado"

### 2. Criar PRD
```bash
/prd
```
- Salva em `.ai/prd.md`
- Solicita aprovação
- Cria no Notion
- Vincula à Sprint

### 3. Criar Estórias
```bash
/story-create
```
- Verifica status do PRD ("Pronto para uso")
- Salva todas em `.ai/estorias/`
- Solicita aprovação
- Cria no Notion
- Herda departamento da Sprint
- Branch: `{branch-sprint}-{numero}` (ex: `feat/oauth-001`)

### 4. Desenvolver e Commitar
```bash
/commit
```
- Salva em `.ai/progressos/`
- Solicita aprovação
- Cria commit Git
- Sincroniza com Notion

### 5. Registrar Progresso
```bash
/progress
```
- Salva em `.ai/progressos/`
- Solicita aprovação
- Sincroniza com Notion
- Considera apenas commits da branch atual

---

**Versão**: 2.0
**Última atualização**: 2025-01-31
