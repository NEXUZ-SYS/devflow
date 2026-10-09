# Roteamento de modelos — pendências pós-entrega

Este é o backlog do workflow `model-routing` (ADR 017). São achados de baixo risco que as revisões da fase E, a revisão final e a fase V triaram para depois. Nenhum deles fura o teto (D5) nem o opt-in (D18).

## Medição e relatório

- **`/model` manual com a rota caindo no mesmo modelo.** A troca da sessão é medida contra o último modelo aplicado. Se o usuário trocar de modelo com `/model` e a rota cair no mesmo modelo que já estava aplicado, essa troca real não é contada. É raro e só afeta a métrica de trocas.
- **Corte do antes × depois.** O corte é a primeira linha do ledger. Os turnos da mesma sessão anteriores a essa linha caem no "antes". Em janelas de dias, a distorção é desprezível. O comportamento está documentado; o que fica pendente é refinar o corte.
- **Ledger do mod.** Ele reescreve o arquivo da sessão a cada turno e tem um teto silencioso de 2000 linhas. É uma questão de desempenho, e o teto é intencional.
- **`renderMarkdown`.** Não escapa `|` nem quebra de linha nos campos. O ledger fica no diretório de dados do próprio usuário, então o impacto é só visual.

## Adaptadores

- **Regra de teto do omp em duas cópias.** A CLI usa `ompCeilingTier`, que tem o fallback `activities.execution`. O enrich (`omp-enrich-project-agents.mjs`) não tem esse fallback. A ideia é unificar num helper só.
- **`parseFrontmatter` do enrich.** Lança erro com âncora YAML e aborta o laço no meio. O mesmo modo de falha já existe em `enrichAgentFrontmatter`, que é código anterior a este workflow. A correção é um try/catch por arquivo nos dois.
- **Fallback clássico no primeiro despacho.** No `PreToolUse` do primeiro despacho da sessão, o transcript ainda não tem mensagem do assistente. O teto fica ilegível e o clássico não roteia (D5). Do segundo turno em diante ele roteia, e o mod roteia desde o primeiro. Está documentado como limitação; falta avaliar se existe outra fonte de teto confiável.
- **Skill digitada como `/nome`.** Ela não passa pelo `tool.call` da ferramenta Skill, então o esforço por skill não reage. A sessão perde essa cobertura, sem risco para o teto.
- **Esc durante a decisão da escalada no meio.** O sinal de abortar não é repassado ao `$.model.complete`. O resultado da ferramenta pode esperar até 8 s. A escalada no meio vem desligada por padrão.
- **`escalate --report` sem opt-in.** Imprime a rubrica, com o relato redigido, mesmo sem opt-in. Não decide nada; o caminho `--answers` está protegido.
- **TOCTOU entre o realpath e o open nas leituras do projeto.** Explorar exige uma corrida local com escrita no repositório. O limite de tamanho já é aplicado.

## Testes de reforço

- Testes de `maxTier`, de `model` explícito e de override acima do teto nos resolvedores. A lógica está correta pela leitura.
- Modos 0700/0600 do diretório e do arquivo de ledger, que hoje só foram verificados à mão.
- O teste de FIFO do clássico só mede tempo.
- O teste "desligado = hoje" do enrich do omp só compara o architect.
- O teste do doctor não tem caso com `.devflow.yaml` ausente.

## Cosmético

- Import `normalizeNewlines` sem uso em `models-config.mjs`.
- Comentário do wrapper `hooks/pre-tool-use-agent` sobre exec e PID sob dash.
- Comentário com "node:" que escapa do teste de pureza.
