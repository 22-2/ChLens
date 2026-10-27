import type { IRes } from "src/service-container/interfaces";
import { create } from "zustand";

export interface ThreadSnapshot {
  threadUrl: string;
  responses: readonly IRes[];
  loading: boolean;
  error: string | null;
  expired: boolean;
}
interface Entry {
  owner: symbol;
  snapshot: ThreadSnapshot;
}
interface State {
  entries: ReadonlyMap<string, Entry>;
}
export const useThreadSnapshots = create<State>(() => ({ entries: new Map() }));

/** タブごとの所有者を識別し、古い画面の解除で新しい状態を消さない。 */
export function publishThreadSnapshot(
  tabId: string,
  owner: symbol,
  snapshot: ThreadSnapshot,
): void {
  useThreadSnapshots.setState((state) => ({
    entries: new Map(state.entries).set(tabId, { owner, snapshot }),
  }));
}
export function removeThreadSnapshot(tabId: string, owner: symbol): void {
  useThreadSnapshots.setState((state) => {
    if (state.entries.get(tabId)?.owner !== owner) return state;
    const entries = new Map(state.entries);
    entries.delete(tabId);
    return { entries };
  });
}
