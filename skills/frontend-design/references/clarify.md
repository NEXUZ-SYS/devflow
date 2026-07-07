# clarify — UX copy clara e acionável

## Objetivo

Identificar e consertar texto de interface pouco claro — o que gera ticket de suporte e abandono. Cobre forms, botões, mensagens de erro, navegação, empty states: onde o usuário encontra instrução ou feedback escrito.

## Quando usar

- Ao auditar copy de qualquer superfície com texto (labels, botões, erros, vazios).
- Quando o usuário reclama que "não entende o que a tela pede".

## Grounding

Leia `@.context/product/product-tone-of-voice.md` — **a voz e o vocabulário saem daqui** (é o dono da copy). Leia `@.context/business/business-icp.md` (nível do público, estado mental, ação requerida). Toda escolha de palavra deve bater com o tone-of-voice documentado.

## Passos

1. **Avaliar a copy atual** — jargão, ambiguidade, voz passiva, prolixidade, contexto faltando, tom incompatível.
2. **Entender o contexto** — nível da audiência, estado mental do usuário, ação necessária, restrições.
3. **Planejar** — mensagem primária, próxima ação, tom apropriado.
4. **Melhorar sistematicamente** — erros, forms, botões, help text, empty states, mensagens de sucesso, loading, confirmações, navegação.
5. **Aplicar clareza** — específico, conciso, ativo, humano.
6. **Verificar** — compreensão, acionabilidade, brevidade, consistência, tom.

## Fórmulas (guarde)

**Botões:** nunca "OK"/"Enviar"/"Sim/Não"; use **verbo específico + objeto** ("Salvar alterações"). Ação destrutiva: **nomeie a destruição** ("Excluir 5 itens", não "Excluir selecionados").

**Erro (responda 3 perguntas):** (1) O que aconteceu? (2) Por quê? (3) Como resolver? Template: **"[Campo] precisa ser [formato]. Exemplo: [exemplo]"**. Nunca culpe o usuário: "Informe a data no formato DD/MM/AAAA", não "Você digitou uma data inválida".

**Voz vs. tom:** a **voz** é constante (personalidade da marca); o **tom** muda com o momento — sucesso: comemorativo/breve; erro: empático/prestativo; loading: tranquilizador; confirmação destrutiva: sério/claro. **Nunca humor em erro** (o usuário está frustrado).

**i18n:** conte com expansão (alemão +30%, francês +20%); mantenha números separados do texto; use frases completas como string única de tradução; evite abreviação.

**Empty state:** reconheça brevemente, explique o valor, dê ação clara — "Ainda sem projetos. Crie o primeiro para começar", não só "Nenhum item".

**Núcleo:** específico ("Informe o e-mail", não "Informe o valor"); voz ativa ("Salvar alterações", não "As alterações serão salvas"); humano ("Ops, algo deu errado", não "Erro de sistema"); escolha um termo e mantenha (não varie a terminologia).
