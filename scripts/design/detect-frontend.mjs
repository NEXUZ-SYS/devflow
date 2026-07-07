// scripts/design/detect-frontend.mjs — detecção determinística de projeto front-end.
// Usado pelo modo `frontend-design init` e pelo Step de detecção do project-init /
// post-update-guide. Segurança (Revisão R): JSON.parse guardado (malformado → não crash),
// walk sem seguir symlink, excluindo node_modules/.git, profundidade limitada.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Deps cujo cliente indica front-end (o `key` é o nome do pacote).
const FRONTEND_DEPS = [
  "react", "react-dom", "vue", "svelte", "@sveltejs/kit", "next", "nuxt",
  "astro", "solid-js", "preact", "lit", "@angular/core", "gatsby",
  "remix", "@remix-run/react", "qwik", "@builder.io/qwik",
];

const FE_FILE_RE = /\.(tsx|jsx|vue|svelte)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".svelte-kit", ".astro"]);
const MAX_DEPTH = 6;

function readPackageDeps(projectDir) {
  try {
    const raw = readFileSync(join(projectDir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    return null; // ausente ou malformado → sem sinal de dep (nunca lança)
  }
}

// Walk seguro: sem seguir symlink (dirent.isDirectory() é false para symlink),
// pula node_modules/.git, profundidade limitada. Retorna true no primeiro arquivo FE.
function hasFrontendFile(dir, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const ent of entries) {
    if (ent.isSymbolicLink()) continue; // nunca segue symlink
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
      if (hasFrontendFile(join(dir, ent.name), depth + 1)) return true;
    } else if (ent.isFile() && FE_FILE_RE.test(ent.name)) {
      return true;
    }
  }
  return false;
}

export function detectFrontend(projectDir) {
  const root = resolve(projectDir || ".");
  const signals = [];

  const deps = readPackageDeps(root);
  if (deps) {
    for (const name of FRONTEND_DEPS) {
      if (name in deps) signals.push(`dep:${name}`);
    }
  }

  if (signals.length === 0 && hasFrontendFile(root)) {
    signals.push("file:*.{tsx,jsx,vue,svelte}");
  }

  return {
    isFrontend: signals.length > 0,
    signals,
    register: null, // 'brand' | 'product' resolvido interativamente no modo init
  };
}

// CLI: `node scripts/design/detect-frontend.mjs [dir]` → imprime JSON.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(detectFrontend(process.argv[2] || "."), null, 2));
}
