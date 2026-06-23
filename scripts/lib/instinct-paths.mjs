// scripts/lib/instinct-paths.mjs
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export function baseDir() {
  const o = process.env.DEVFLOW_INSTINCTS_DIR;
  if (o && isAbsolute(o)) return o;
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && isAbsolute(xdg)) return join(xdg, 'devflow-instincts');
  return join(homedir(), '.local', 'share', 'devflow-instincts');
}

// I5: normalização SEM credencial — reusada pelo hash E pelo remote guardado no registry
export function normalizeRemote(remoteUrl) {
  return String(remoteUrl || '')
    .replace(/:\/\/[^@]+@/, '://')          // strip credenciais
    .replace(/^[A-Za-z][\w+.-]*:\/\//, '')  // strip scheme
    .replace(/^[^@/:]+@([^:/]+):/, '$1/')   // scp-like → host/path
    .replace(/\.git\/?$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function projectId(remoteUrl) {
  return createHash('sha256').update(normalizeRemote(remoteUrl)).digest('hex').slice(0, 12);
}

export const projectDir = (id) => join(baseDir(), 'projects', id);
export const instinctsDir = (id) => join(projectDir(id), 'instincts');
export const observationsFile = (id) => join(projectDir(id), 'observations.jsonl');
export const projectsRegistry = () => join(baseDir(), 'projects.json'); // I5: hash→{name,remote(normalizado),last_seen,counts}
export const globalDir = () => join(baseDir(), 'global', 'instincts');
export const indexFile = (id, scope) =>
  scope === 'global' ? join(baseDir(), 'global', 'index.json') : join(projectDir(id), 'index.json');
