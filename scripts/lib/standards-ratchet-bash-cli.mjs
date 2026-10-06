// scripts/lib/standards-ratchet-bash-cli.mjs — stdin: evento do PreToolUse (Bash, NotebookEdit ou
// mcp__*); stdout: UM JSON `ask` numa linha, ou nada. Chamado por hooks/pre-tool-use-ratchet só
// quando o evento cita a catraca. SI-1: arquivo invocado com stdin, sem argumentos.
//
// Sem teto de leitura aqui: o hook só repassa eventos de até 1 MiB (acima disso ele mesmo decide).
import { ratchetOutput } from "./standards-ratchet-bash.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
process.stdout.write(ratchetOutput(Buffer.concat(chunks))); // nunca lança
