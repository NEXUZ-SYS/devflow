#!/usr/bin/env node
// assets/standards/profiles/odoo/machine/std-odoo-security.js — linter default
// bundlado do perfil Odoo (TCB do plugin). Controle de acesso e exposição:
// detecta o anti-padrão clássico de rota HTTP pública (auth public/none) que
// também usa .sudo() no mesmo arquivo — bypass de ACL sem autenticação.
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' + exit 1.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !fp.endsWith(".py")) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const v = [];

// Rota pública/sem auth: @http.route(...) com auth='public' | auth='none'.
// Aceita o casamento dentro da própria chamada .route(...) (multilinha via flag s)
// OU, como fallback robusto, a coexistência de um @http.route( e de um
// auth='public'/'none' no mesmo arquivo (decorators que quebram a linha).
const authPublicInRoute = /@http\.route\([^)]*auth\s*=\s*['"](?:public|none)['"]/s.test(c);
const hasRoute = /@http\.route\s*\(/.test(c);
const hasAuthPublic = /auth\s*=\s*['"](?:public|none)['"]/.test(c);
const publicRoute = authPublicInRoute || (hasRoute && hasAuthPublic);

// .sudo( — escalação de privilégio que ignora as regras de acesso (ACL/record rules).
const hasSudo = /\.sudo\s*\(/.test(c);

if (publicRoute && hasSudo) {
  v.push("rota auth public/none combinada com sudo() — risco de exposição de dados sem ACL");
}

if (v.length > 0) {
  console.log(`VIOLATION: ${v.length} risco(s) de segurança (${v.join("; ")}) em ${fp}. Ver std-odoo-security › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
