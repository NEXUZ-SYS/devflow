// scripts/lib/phase-gate-cli.mjs — stdin: evento do PreToolUse; stdout: UM JSON numa linha, ou nada.
// Chamado por hooks/pre-tool-use-phase-gate só quando o evento cita o avanço. Sem guarda de "módulo
// principal": com o plugin instalado por symlink a comparação de caminhos falharia e o gate passaria calado.
import { decide } from "./phase-gate.mjs";

let ev = null;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  ev = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch { ev = null; }
const o = decide(ev);
if (o) process.stdout.write(o + "\n");
