// scripts/lib/instinct-confidence.mjs
// Matemática de confiança + identidade do instinct store. Puro, sem I/O.
export const INITIAL = 0.3;
export const CAP = 0.9;
export const RECALL_MIN = 0.6;
export const BRIDGE_MIN = 0.8;

const round1 = (n) => Math.round(n * 10) / 10;
export const reinforce = (c) => round1(Math.min(CAP, c + 0.1));
export const applyCorrection = (c) => round1(Math.min(CAP, c + 0.2));
export const statusFor = (c) => (c >= RECALL_MIN ? 'active' : 'pending');
export const eligibleForBridge = (inst) =>
  inst.scope === 'global' || inst.confidence >= BRIDGE_MIN;
export const triggerKey = (t) =>
  String(t || '').toLowerCase().trim().replace(/\s+/g, ' ');
