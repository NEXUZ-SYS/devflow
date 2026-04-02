# 🎯 Objetivo

Este documento define a estrutura e os artefatos utilizados no fluxo de desenvolvimento e documentação assistido por IA.  
O foco é gerar e manter **PRDs**, **ADRs**, **Estórias** e **Progressos**, integrados com o **Notion** e versionados no repositório.

---

## 🧠 Propósito

Padronizar como as entregas de desenvolvimento são planejadas, executadas e documentadas, garantindo rastreabilidade entre:

- **Épicos**
- **Sprints**
- **Estórias**
- **Progressos**

E mantendo a geração e atualização automatizada de:

- **PRDs (Product Requirements Documents)**
- **ADRs (Architecture Decision Records)**

---

## 🗂️ Estrutura de Databases no Notion

| Database | Função |
|-----------|--------|
| **Épicos** | Representam grandes objetivos ou temas de produto. São a origem das sprints e PRDs. |
| **Sprints** | Unidade tática de execução. Contém o PRD, ADRs e links para estórias. |
| **Estórias** | Tasks específicas derivadas do PRD, com execução clara e granular. |
| **Progressos** | Diário de execução (histórico de commits, status, e evolução técnica). |

---

## 🧩 Relação entre as entidades

1. **Épico → Sprint → Estórias → Progressos**  
   Cada camada se relaciona diretamente com a anterior, criando uma cadeia de rastreabilidade completa.  

2. **PRDs e ADRs**  
   São vinculados à **Sprint** e, quando necessário, às **Estórias**.  
   Caso tenham impacto relevante no projeto (arquitetura ou padrão global), devem ser replicados na pasta `/docs`.

---

## ⚙️ Estrutura de Branches

A padronização das branches garante clareza e organização no versionamento do código.

### ✅ Caso 1 — Sprint com apenas uma pessoa responsável

Exemplos:

feat/open-delivery
fix/client-name

### 👥 Caso 2 — Sprint com múltiplos responsáveis

Haverá uma **branch principal da sprint** e **sub-branches** para cada estória:

Exemplo:

feat/open-delivery-01
feat/open-delivery-02

---

## 🧱 Database **Progresso**

A database **Progresso** atua como um **diário de execução técnica**.  
Cada commit realizado deve gerar uma entrada automática ou manual, vinculada a:

- Épico  
- Sprint  
- Estória  

E conter também:

- **Hash ou URL do commit**
- **Descrição do avanço**
- **Checklist ou status técnico**

Essa rastreabilidade permite acompanhar o desenvolvimento via **Kanban no Notion**, filtrando por Sprint, Estória e Progresso.

---

## 📘 Documentos principais

Os documentos **PRD**, **ADR**, **Estória** e **Progresso** são responsabilidade da **Sprint e/ou Estória** associada.

Em casos de impacto mais amplo (arquitetura global, componentes reutilizáveis, design patterns, etc.), o documento deve ser movido ou copiado para:

/docs

---

## 🪶 Regras gerais de versionamento

1. Todo documento gerado (PRD, ADR, Estória, Progresso) deve ser salvo sob o contexto da **Sprint** correspondente.  
2. Caso o documento tenha impacto cross-projeto, ele também deve ser registrado na pasta **`/docs`**.  
3. A IA (local ou via automação) pode ser usada para gerar, atualizar ou vincular documentos a partir desse padrão.

---

## 💡 Fluxo resumido

Épico.  
└── Sprint (contém PRD + ADRs).  
├── Estórias (tarefas individuais).  
│    └── Progressos (commits, histórico, notas).  
└── /docs (caso o impacto seja amplo).

---

## ✅ Benefícios

- Rastreabilidade ponta a ponta (da ideia ao commit).  
- Integração simples com Notion e Git.  
- Padronização de documentação técnica e de produto.  
- Histórico automático de decisões e progresso.  
- Base pronta para automações com IA ou pipelines (ex: `generate_docs.py`).

---

**Versão:** 1.0  
**Responsável:** Matheus Caldeira  
**Última atualização:** _(gerar automaticamente na automação)_
