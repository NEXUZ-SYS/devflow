// Contrato do $.state do plugin devflow (o claude plugin validate confere as chaves usadas no módulo).
// Só exports de tipo: o validate recusa qualquer outro export.
export type RoutingOrigin = "roteado" | "teto";
export type RoutingLoop = { model: string | null; effort: string | null; origin: RoutingOrigin };
export type RoutingSnapshot = { active: boolean; failureStreak: number; loops: Record<string, RoutingLoop> };
export type MonitorRow = {
  id: string; label: string; startedAt: number; lastEventAt: number;
  model: string | null; effort: string | null; streak: number; retries: number | null;
};

declare module "claude-code" {
  interface PluginState {
    devflow: {
      routing: RoutingSnapshot;
      monitorRows: MonitorRow[];
      monitorRetries: Record<string, number>;
    };
  }
}
