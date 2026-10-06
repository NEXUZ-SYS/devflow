// tests/lib/test-safe-read.mjs — leitura segura (T9), endurecida na T14 rodada 1.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRegularFileSafe, readRegularFileDetailed } from "../../scripts/lib/safe-read.mjs";

const dir = mkdtempSync(join(tmpdir(), "safe-read-"));
after(() => rmSync(dir, { recursive: true, force: true }));

// Guarda de regressão (o original já fechava o fd; a reescrita da rodada 1 não pode perder isso).
test("não vaza descritor: 300 leituras não aumentam os fds abertos", { skip: !existsSync("/proc/self/fd") }, () => {
  const p = join(dir, "ok.txt");
  writeFileSync(p, "conteúdo");
  const before = readdirSync("/proc/self/fd").length;
  for (let i = 0; i < 300; i++) assert.equal(readRegularFileSafe(p, 1024), "conteúdo");
  const big = join(dir, "big.txt");
  writeFileSync(big, "x".repeat(2048));
  for (let i = 0; i < 300; i++) assert.equal(readRegularFileSafe(big, 1024), null);
  assert.ok(readdirSync("/proc/self/fd").length - before < 5, "descritores vazaram");
});

test("readRegularFileDetailed devolve o motivo: ENOENT, ELOOP, NOT_FILE, TOO_BIG", () => {
  assert.equal(readRegularFileDetailed(join(dir, "nao-existe")).code, "ENOENT");
  const link = join(dir, "link");
  symlinkSync("/dev/zero", link);
  assert.equal(readRegularFileDetailed(link).code, "ELOOP");
  const fifo = join(dir, "fifo");
  spawnSync("mkfifo", [fifo]);
  assert.equal(readRegularFileDetailed(fifo).code, "NOT_FILE");
  mkdirSync(join(dir, "d"));
  assert.equal(readRegularFileDetailed(join(dir, "d")).code, "NOT_FILE");
  const big = join(dir, "big2.txt");
  writeFileSync(big, "x".repeat(11));
  assert.equal(readRegularFileDetailed(big, 10).code, "TOO_BIG");
  assert.deepEqual(readRegularFileDetailed(big, 11), { ok: true, text: "x".repeat(11) });
});

test("nofollow: false segue symlink para arquivo regular e continua recusando FIFO sem travar", () => {
  const alvo = join(dir, "alvo.txt");
  writeFileSync(alvo, "via link");
  const link = join(dir, "link-regular");
  symlinkSync(alvo, link);
  assert.equal(readRegularFileDetailed(link).code, "ELOOP", "padrão continua O_NOFOLLOW");
  assert.deepEqual(readRegularFileDetailed(link, 1024, { nofollow: false }), { ok: true, text: "via link" });
  const fifo = join(dir, "fifo2");
  spawnSync("mkfifo", [fifo]);
  const viaLink = join(dir, "link-fifo");
  symlinkSync(fifo, viaLink);
  const t0 = Date.now();
  assert.equal(readRegularFileDetailed(viaLink, 1024, { nofollow: false }).code, "NOT_FILE");
  assert.ok(Date.now() - t0 < 1000);
});
