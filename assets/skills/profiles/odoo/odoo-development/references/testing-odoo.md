# Testes em Odoo (12 -> 18)

> Padroes de teste do framework Odoo, validos em qualquer projeto. O ambiente concreto
> de execucao (DB, container, porta) vive no `.context/` do projeto, nao aqui.
>
> **Grounding:** `odoo.com/documentation/NN.0/developer/reference/backend/testing.html`;
> `search_docs` lib `odoo-NN`.

## Classes de teste

| Classe | Quando usar |
|--------|-------------|
| `TransactionCase` | Modelos, computed fields, constraints, services. Cada teste roda em savepoint e da rollback |
| `HttpCase` | Controllers, endpoints HTTP, tours UI (com navegador headless) |
| `SavepointCase` | (12-15) variante de `TransactionCase` com `setUpClass` em savepoint; absorvida por `TransactionCase` no 16+ |

> No Odoo 16+ `TransactionCase.setUpClass` ja roda num savepoint compartilhado;
> `SavepointCase` foi descontinuada. Confirme conforme a versao target.

## Tiers de teste (estrategia generica)

| Tier | Quando aplicar | Cobre |
|------|----------------|-------|
| T1 — minimo | Todo modulo / toda migracao | Instalacao, modelos acessiveis, campos existem |
| T2 — funcional | Modulos com logica de negocio | T1 + computed fields, CRUD, metodos ORM |
| T3 — integracao | Stack REST, cross-module | T1 + T2 + endpoints HTTP, auth flow, validators |

## Unit test (TransactionCase)

```python
from odoo.tests import common, tagged

@tagged("post_install", "-at_install")
class TestFeatureCase(common.TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.model = cls.env["model.name"]

    def test_model_accessible(self):
        """T1: modelo acessivel."""
        self.assertIn("model.name", self.env)

    def test_fields_exist(self):
        """T1: campos esperados existem."""
        fields = self.model.fields_get()
        for f in ["field1", "field2"]:
            self.assertIn(f, fields)
```

## Controller test (HttpCase)

```python
from odoo.tests import common, tagged

@tagged("post_install", "-at_install")
class TestControllerCase(common.HttpCase):
    def test_endpoint_accessible(self):
        """T3: endpoint REST responde."""
        response = self.url_open(
            "/api/endpoint",
            data="{}",
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(response.status_code, 200)
```

## Cuidados comuns

| Cuidado | Detalhes |
|---------|----------|
| `cr.commit()` destroi savepoints | Isolar testes que comitam em classes separadas |
| `company_dependent` cria `ir.property` | Checar duplicatas antes de inserir nos fixtures |
| Constraints unique em fixtures | Limpar registros conflitantes no `setUpClass` |
| Testes em paralelo no mesmo DB | PostgreSQL `SerializationFailure` — rodar sequencialmente |
| Nao duplicar testes de modulos OCA/terceiros | Cobrir apenas as extensoes proprias do projeto |

## Execucao (padrao, sem cravar ambiente)

Rodar via `odoo-bin` com `--test-enable` e `--stop-after-init`, instalando/atualizando
o modulo alvo. O comando concreto (binario, DB, flags de rede, container) e definido
no `.context/` do projeto. Padrao geral:

```
odoo-bin -d <DB> --test-enable -u <modulo> --stop-after-init
```

> Apos `update` de modulo, reinicie o processo Odoo — o cache de assets/registry nem
> sempre invalida sozinho.

## Code review de migracao

1. Classificar CADA customizacao (REESCRITA / ABSORVIDA / ADAPTADA / PRESERVADA /
   INTERNALIZADA / REMOVIDA).
2. Se houver REMOVIDA -> PARAR e apresentar opcoes ao usuario.
3. Salvar o relatorio de review no path de migracao do modulo (definido no projeto).
