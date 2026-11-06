/** Browser-safe constants shared by the widget and the verifier. */

/** Action id. One Developer Portal action; per-Trench uniqueness comes from our unique index. */
export const WORLD_ACTION = "join-trench";

/** Signal binds the proof to this Trench and this wallet. */
export function joinSignal(trenchId: string, trader: string): string {
  return `${trenchId}:${trader.toLowerCase()}`;
}
