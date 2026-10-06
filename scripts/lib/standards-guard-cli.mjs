// scripts/lib/standards-guard-cli.mjs — stdin: evento do PreToolUse (Edit/Write); stdout:
// {"decision","reason"} com a razão CRUA (o hook serializa por emit_decision). A decisão é a
// primeira chave: o hook casa o prefixo `{"decision":"deny",` / `{"decision":"ask",` sem
// precisar de outro processo para ler a decisão. SI-1: arquivo invocado com stdin.
//
// Sem teto de leitura de propósito: um Write grande no baseline.json não pode virar "nada a
// decidir" por tamanho (o evento já cabe na variável do hook que o repassa).
import { evaluateStandardsEdit } from "./standards-guard.mjs";

let raw = "";
for await (const d of process.stdin) raw += d;
let out = { decision: "", reason: "" };
let ev = null;
try { ev = JSON.parse(raw); } catch { /* sem caminho legível: nada a decidir */ }
if (ev && typeof ev === "object") out = evaluateStandardsEdit(ev); // nunca lança
process.stdout.write(JSON.stringify({ decision: out.decision || "", reason: out.reason || "" }));
