#!/usr/bin/env node
// scripts/instinct-cli.mjs — interface entre hooks Bash e o store Node.
import * as obs from './lib/instinct-observations.mjs';
import * as store from './lib/instinct-store.mjs';
import { buildDigest } from './lib/instinct-recall.mjs';
import { projectId as hashRemote } from './lib/instinct-paths.mjs';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };

function resolvePid() {
  if (process.env.DEVFLOW_INSTINCT_PID) return process.env.DEVFLOW_INSTINCT_PID;
  try { return hashRemote(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim()); }
  catch { return null; } // sem repo git → no-op
}
const enabled = () => process.env.DEVFLOW_INSTINCTS_ENABLED === '1';

try {
  const pid = resolvePid();
  if (cmd === 'capture') {
    if (!enabled() || !pid) process.exit(0);
    await obs.appendObservation(pid, { tool: flag('tool'), target: flag('target'), outcome: flag('outcome', 'ok') });
    // registry best-effort: name=basename(cwd), remote=git origin (ambos opcionais)
    try {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim();
      await store.touchRegistry(pid, { name: basename(process.cwd()), remote });
    } catch {}
  } else if (cmd === 'promote') {
    process.stdout.write(JSON.stringify(await store.promoteAcrossProjects()));
  } else if (cmd === 'prune') {
    if (pid) process.stdout.write(JSON.stringify(await store.pruneStale(pid, Number(flag('max-age-days', 30)))));
  } else if (cmd === 'recall') {
    if (!pid) process.exit(0);
    process.stdout.write(await buildDigest(pid, { maxChars: Number(flag('max-chars', 2000)) }));
  } else if (cmd === 'mine-read') {
    if (!pid) { process.stdout.write('{"observations":[],"offset":0}'); process.exit(0); }
    process.stdout.write(JSON.stringify(await obs.readUnconsumed(pid)));
  } else if (cmd === 'mine-apply') {
    // C3: contrato primário --json=<file> (robusto a tamanho); --inline só conveniência de teste
    let raw = '[]';
    if (flag('json')) raw = await readFile(flag('json'), 'utf-8');
    else if (args.includes('--inline')) raw = args[args.indexOf('--inline') + 1];
    const items = JSON.parse(raw);
    for (const it of items) {
      await store.upsertInstinct(it.id, { trigger: it.trigger, action: it.action, domain: it.domain || 'workflow',
        scope: 'project', projectId: pid || 'p1', projectName: flag('project-name', 'unknown') }, it.delta ?? 0);
    }
  } else if (cmd === 'status') {
    if (pid) process.stdout.write(await buildDigest(pid, { minConfidence: 0 }));
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`[instinct] ${err.message}\n`);
  process.exit(0); // nunca quebra o hook
}
