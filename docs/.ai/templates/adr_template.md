# 🧱 ADR — [Título curto e descritivo]
> Ex: "Escolha do banco de dados principal"

- **Data:** YYYY-MM-DD
- **Status:** [Proposto | Aprovado | Rejeitado | Substituído]
- **Autor:** [Nome ou responsável]
- **Sprint:** [Sprint atual]
- **Branch:** `feat/<sprint>-<task>`  

---

## 🧠 Contexto
Descreva o cenário ou problema técnico que originou a decisão.  
Ex: "Precisamos de um banco de dados escalável para armazenar logs de auditoria em tempo real."

## 💡 Decisão
Explique qual foi a decisão tomada.  
Ex: "Adotamos DynamoDB como principal banco para logs, devido à escalabilidade e custo previsível."

## ⚖️ Alternativas Consideradas
Liste as opções avaliadas e o motivo pelo qual foram descartadas:
- **PostgreSQL** — alto custo sob carga
- **Elasticsearch** — necessidade de indexação complexa
- **DynamoDB** — escolhido

## 🧩 Consequências
Impactos positivos e negativos da decisão:
- ✅ Simplifica a infraestrutura
- ⚠️ Aumenta acoplamento com AWS
- 🧩 Requer política de IAM específica

## 🔗 Relacionamentos
| Tipo | Referência |
|------|-------------|
| PRD | [link] |
| Estória | [link] |
| Commit | [hash ou URL] |

## 🧱 Evidências / Anexos
Adicione gráficos, benchmarks, diagramas ou snippets relevantes.