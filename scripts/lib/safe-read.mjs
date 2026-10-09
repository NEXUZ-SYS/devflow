// scripts/lib/safe-read.mjs — leitura de arquivo não confiável sem travar o hook.
//
// O agente consegue plantar um FIFO (ou symlink para FIFO/device) no lugar de um arquivo
// que o hook lê; readFileSync seguiria o link e bloquearia até o timeout, perdendo a
// decisão. Aqui: O_NOFOLLOW (symlink → falha), O_NONBLOCK (abrir FIFO não bloqueia),
// fstat exige arquivo regular dentro do teto de bytes, e a leitura é pelo próprio fd.
import { openSync, fstatSync, readSync, closeSync, realpathSync, lstatSync, constants } from "node:fs";
import { join, sep } from "node:path";

/** Teto padrão das leituras de configuração e estado do projeto. */
export const SAFE_READ_MAX_BYTES = 1024 * 1024;

/**
 * Lê `path` como arquivo REGULAR, sem seguir symlink e sem bloquear: `O_NOFOLLOW` (symlink →
 * ELOOP no mesmo syscall do open, sem TOCTOU), `O_NONBLOCK` (FIFO não trava o open nem a
 * leitura), `fstat` exigindo `isFile` (FIFO, socket, dispositivo como /dev/zero) e teto de
 * `maxBytes`. Nunca lança.
 *
 * `nofollow: false` segue symlink (para leitores que sempre seguiram, como o config-guard),
 * mantendo O_NONBLOCK, `isFile` e o teto: um link para FIFO ou dispositivo continua recusado.
 *
 * @returns {{ok: true, text: string} | {ok: false, code: string, message: string}}
 *   `code`: o errno do open (ENOENT, ELOOP, EACCES…), `NOT_FILE` ou `TOO_BIG`.
 */
export function readRegularFileDetailed(path, maxBytes = SAFE_READ_MAX_BYTES, { nofollow = true } = {}) {
  let fd;
  try {
    const follow = nofollow ? (constants.O_NOFOLLOW ?? 0) : 0;
    fd = openSync(path, constants.O_RDONLY | follow | (constants.O_NONBLOCK ?? 0));
  } catch (e) {
    return { ok: false, code: e?.code || "EOPEN", message: e?.message || String(e) };
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return { ok: false, code: "NOT_FILE", message: "não é um arquivo regular" };
    if (st.size > maxBytes) return { ok: false, code: "TOO_BIG", message: `maior que ${maxBytes} bytes` };
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) {
      const n = readSync(fd, buf, off, st.size - off, off);
      if (n <= 0) break;
      off += n;
    }
    return { ok: true, text: buf.subarray(0, off).toString("utf8") };
  } catch (e) {
    return { ok: false, code: e?.code || "EREAD", message: e?.message || String(e) };
  } finally {
    try { closeSync(fd); } catch { /* já fechado */ }
  }
}

/** Conteúdo UTF-8 do arquivo regular `path` (≤ `maxBytes`), ou `null` se não passar. */
export function readRegularFileSafe(path, maxBytes) {
  const r = readRegularFileDetailed(path, maxBytes);
  return r.ok ? r.text : null;
}

/**
 * Leitura de arquivo do projeto com containment (spec §9): o caminho REAL de `root/rel` tem de
 * ficar sob o REAL de `root` (symlink de diretório intermediário não escapa). Nunca lança.
 * `nofollow: true` recusa também symlink no componente final (ELOOP), mesmo para dentro da raiz.
 *
 * @returns {{ok: true, text: string} | {ok: false, code: string, message: string}}
 *   `code`: ENOENT (ausente), OUTSIDE_ROOT, ou o motivo de readRegularFileDetailed.
 */
export function readInRootDetailed(root, rel, maxBytes = SAFE_READ_MAX_BYTES, { nofollow = false } = {}) {
  let base, abs;
  try {
    base = realpathSync(root);
    abs = realpathSync(join(root, rel));
  } catch (e) {
    if (e?.code === "ENOENT") {
      try { lstatSync(join(root, rel)); return { ok: false, code: "ELOOP", message: "symlink sem destino" }; } catch { /* ausente de verdade */ }
    }
    return { ok: false, code: e?.code || "EREALPATH", message: e?.message || String(e) };
  }
  if (!abs.startsWith(base + sep)) return { ok: false, code: "OUTSIDE_ROOT", message: "fora da raiz" };
  if (nofollow) {
    try { if (lstatSync(join(root, rel)).isSymbolicLink()) return { ok: false, code: "ELOOP", message: "symlink" }; } catch { /* segue: a leitura reporta */ }
  }
  return readRegularFileDetailed(abs, maxBytes);
}

/** Texto do arquivo regular `root/rel` contido na raiz, ou `null` por qualquer motivo. */
export function readInRoot(root, rel, maxBytes = SAFE_READ_MAX_BYTES) {
  const r = readInRootDetailed(root, rel, maxBytes);
  return r.ok ? r.text : null;
}
