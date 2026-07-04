// scripts/design/reconcile-impeccable.mjs — reconciliação de um impeccable CRU já instalado.
// Usado pelo modo `frontend-design init --from-impeccable` (Task E2). Migra artefatos do
// toolkit upstream (pbakaus/impeccable) para o layout DevFlow, de forma CONSENT-GATED:
// todas as funções são PURAS/testáveis e as ações destrutivas RETORNAM UM PLANO — quem
// executa é o modo init, só com consentimento explícito.
//
// Invariantes de segurança (Revisão R):
//  - JSON.parse sempre em try/catch (malformado → degrada, não crash).
//  - rule-ids importados de .impeccable/config.json validados contra o ALLOWLIST das 45
//    regras de design; desconhecidos/metacaracteres → rejected (tratados como DADOS, nunca
//    interpolados em path/shell).
//  - edição de settings.json é CIRÚRGICA: parse → remove só a entrada-alvo (match do comando
//    do impeccable) → backup .bak → revalida JSON → escrita atômica; preserva os demais hooks.
import { existsSync, readFileSync, writeFileSync, copyFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Allowlist das 45 regras de design (fonte: docs/design-rules-classification.md) ──────────
// IDs tratados como DADOS. Só entra em `waivers` o id que casa SAFE_ID_RE E pertence ao set.
export const RULE_ALLOWLIST = Object.freeze(new Set([
  // slop (27)
  "side-tab", "border-accent-on-rounded", "overused-font", "single-font",
  "flat-type-hierarchy", "gradient-text", "ai-color-palette", "cream-palette",
  "nested-cards", "monotonous-spacing", "bounce-easing", "dark-glow",
  "icon-tile-stack", "italic-serif-display", "hero-eyebrow-chip",
  "repeated-section-kickers", "numbered-section-markers", "em-dash-overuse",
  "marketing-buzzword", "aphoristic-cadence", "oversized-h1",
  "extreme-negative-tracking", "gpt-thin-border-wide-shadow",
  "repeating-stripes-gradient", "codex-grid-background", "theater-slop-phrase",
  "image-hover-transform",
  // quality (18: 14 não-a11y + 4 a11y candidatas)
  "broken-image", "gray-on-color", "low-contrast", "layout-transition",
  "line-length", "cramped-padding", "body-text-viewport-edge", "tight-leading",
  "skipped-heading", "justified-text", "tiny-text", "all-caps-body",
  "wide-tracking", "text-overflow", "clipped-overflow-container",
  "design-system-font", "design-system-color", "design-system-radius",
]));

// id de regra bem-formado: minúsculas/dígitos/hífen. Rejeita `../`, `/`, espaço, `;`, etc.
const SAFE_ID_RE = /^[a-z][a-z0-9-]*$/;

// Campos do .impeccable/config.json onde rule-ids ignorados podem aparecer (schema upstream
// não é 100% conhecido — cobrimos os nomes plausíveis; ver "Decisões" no relatório).
const WAIVER_ARRAY_FIELDS = ["ignore", "ignored", "disabled", "disabledRules", "waivers", "exclude", "suppress"];

function safeReadJson(path) {
  try {
    if (!path || !existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null; // ausente ou malformado → sem dado (nunca lança)
  }
}

function isDir(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

// Identifica o comando de hook do impeccable. O install upstream coloca a skill em
// `.claude/skills/impeccable/` e registra um PostToolUse que roda seu `hook.mjs` — o
// comando carrega, portanto, o substring "impeccable" no path. Preciso o bastante:
// comandos do DevFlow nunca contêm "impeccable".
export function isImpeccableHookCommand(cmd) {
  return typeof cmd === "string" && /impeccable/i.test(cmd);
}

// Varre hooks.PostToolUse procurando um comando do impeccable.
function hasImpeccableHook(settings) {
  const groups = settings && settings.hooks && settings.hooks.PostToolUse;
  if (!Array.isArray(groups)) return false;
  for (const g of groups) {
    const inner = g && g.hooks;
    if (!Array.isArray(inner)) continue;
    if (inner.some((h) => h && isImpeccableHookCommand(h.command))) return true;
  }
  return false;
}

// ── detectRawImpeccable ─────────────────────────────────────────────────────────────────────
// Detecta um impeccable cru instalado no projeto: dir da skill, hook no settings.json e config.
export function detectRawImpeccable(projectDir) {
  const root = projectDir || ".";
  const skillDirCandidate = join(root, ".claude", "skills", "impeccable");
  const skillDir = isDir(skillDirCandidate) ? skillDirCandidate : null;

  // settings.json é o alvo canônico; settings.local.json é fallback.
  let settingsPath = null;
  for (const name of ["settings.json", "settings.local.json"]) {
    const p = join(root, ".claude", name);
    if (existsSync(p)) { settingsPath = p; break; }
  }
  const hookInSettings = settingsPath ? hasImpeccableHook(safeReadJson(settingsPath)) : false;

  const configCandidate = join(root, ".impeccable", "config.json");
  const configPath = existsSync(configCandidate) ? configCandidate : null;

  const present = Boolean(skillDir) || hookInSettings || Boolean(configPath);
  return { present, skillDir, hookInSettings, settingsPath, configPath };
}

// ── importWaivers ─────────────────────────────────────────────────────────────────────────
// Lê .impeccable/config.json e extrai os rule-ids ignorados, validando contra o allowlist.
// Malformado/ausente → { waivers: [], rejected: [] } (nunca lança).
export function importWaivers(configPath) {
  const cfg = safeReadJson(configPath);
  if (!cfg || typeof cfg !== "object") return { waivers: [], rejected: [] };

  const candidates = [];
  for (const field of WAIVER_ARRAY_FIELDS) {
    const v = cfg[field];
    if (Array.isArray(v)) candidates.push(...v);
  }
  // `rules` como objeto { ruleId: false | "off" | "disabled" } → id ignorado.
  if (cfg.rules && typeof cfg.rules === "object" && !Array.isArray(cfg.rules)) {
    for (const [id, val] of Object.entries(cfg.rules)) {
      if (val === false || val === "off" || val === "disabled" || val === 0) candidates.push(id);
    }
  }

  const waivers = new Set();
  const rejected = new Set();
  for (const raw of candidates) {
    if (typeof raw !== "string") { rejected.add(String(raw)); continue; }
    // NÃO faz trim: espaço/metacaractere deve reprovar (valor é dado não-confiável).
    if (SAFE_ID_RE.test(raw) && RULE_ALLOWLIST.has(raw)) waivers.add(raw);
    else rejected.add(raw);
  }
  return { waivers: [...waivers], rejected: [...rejected] };
}

// ── planReconciliation ──────────────────────────────────────────────────────────────────────
// Monta o PLANO de reconciliação SEM executar. Descreve o que faria.
export function planReconciliation(projectDir) {
  const det = detectRawImpeccable(projectDir);
  const actions = [];

  if (!det.present) {
    return { actions: ["Nenhum impeccable cru detectado — nada a reconciliar."], settingsBackup: null };
  }

  let settingsBackup = null;
  if (det.hookInSettings && det.settingsPath) {
    settingsBackup = det.settingsPath + ".bak";
    actions.push(
      `Desligar o hook PostToolUse do impeccable em ${det.settingsPath} ` +
      `(edição cirúrgica; backup ${settingsBackup}; demais hooks preservados).`,
    );
  }

  if (det.configPath) {
    const { waivers, rejected } = importWaivers(det.configPath);
    actions.push(
      `Importar ${waivers.length} waiver(s) de ${det.configPath} para o sistema único de ` +
      `waiver dos Standards (${rejected.length} rejeitado(s) por serem desconhecidos/malformados).`,
    );
  }

  if (det.skillDir) {
    actions.push(`Aposentar a skill impeccable em ${det.skillDir} (substituída por devflow:frontend-design).`);
  }

  return { actions, settingsBackup };
}

// ── disableImpeccableHook ───────────────────────────────────────────────────────────────────
// Remove APENAS o hook do impeccable do settings.json. Com apply:false (default) só retorna o
// plano/diff. Com apply:true edita: backup .bak → revalida → escrita atômica. Preserva todos
// os outros hooks (DevFlow etc.).
export function disableImpeccableHook(settingsPath, { apply = false } = {}) {
  const base = { settingsPath, applied: false, changed: false, removed: [], preserved: [], backupPath: null };

  if (!settingsPath || !existsSync(settingsPath)) {
    return { ...base, error: "settings.json ausente" };
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    return { ...base, error: "settings.json malformado (não editado)" };
  }

  const removed = [];
  const preserved = [];
  const groups = settings && settings.hooks && settings.hooks.PostToolUse;
  const newGroups = [];
  if (Array.isArray(groups)) {
    for (const g of groups) {
      const inner = Array.isArray(g && g.hooks) ? g.hooks : [];
      const keptInner = [];
      for (const h of inner) {
        if (h && isImpeccableHookCommand(h.command)) removed.push(h.command);
        else { keptInner.push(h); if (h && typeof h.command === "string") preserved.push(h.command); }
      }
      // Grupo cujos hooks internos ficaram todos removidos → some. Senão, mantém (com os que sobraram).
      if (keptInner.length > 0) newGroups.push({ ...g, hooks: keptInner });
    }
  }

  const changed = removed.length > 0;
  const backupPath = settingsPath + ".bak";

  if (!apply) {
    return { ...base, changed, removed, preserved, backupPath: changed ? backupPath : null };
  }

  if (!changed) {
    // Nada a remover: no-op idempotente, sem criar backup nem reescrever.
    return { ...base, applied: true, changed: false, removed, preserved, backupPath: null };
  }

  // Aplica cirurgicamente.
  const next = { ...settings, hooks: { ...settings.hooks, PostToolUse: newGroups } };
  const serialized = JSON.stringify(next, null, 2) + "\n";
  // Revalida antes de tocar o disco: o JSON gerado tem de parsear.
  JSON.parse(serialized);

  // 1) backup do original. 2) escrita atômica (temp no mesmo dir → rename).
  copyFileSync(settingsPath, backupPath);
  const tmpPath = settingsPath + ".tmp-" + process.pid;
  writeFileSync(tmpPath, serialized);
  renameSync(tmpPath, settingsPath);

  return { settingsPath, applied: true, changed: true, removed, preserved, backupPath };
}

// CLI: `node scripts/design/reconcile-impeccable.mjs [dir]` → imprime detecção + plano (nunca edita).
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || ".";
  const out = { detect: detectRawImpeccable(dir), plan: planReconciliation(dir) };
  console.log(JSON.stringify(out, null, 2));
}
