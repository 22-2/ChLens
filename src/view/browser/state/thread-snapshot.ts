import type { IRes } from "src/service-container/interfaces";
import { create } from "zustand";

export interface ThreadSnapshot {
  threadUrl: string;
  /** 取得済みの全レス。レス数や勢いは NG に関係なくスレ全体で数える。 */
  responses: readonly IRes[];
  /** 本文で表示されるレス。抽出など本文に対応する一覧は NG で隠れたレスを含めない。 */
  visibleResponses: readonly IRes[];
  /** 返信数は本文と同じNG・実況状態に合わせる。 */
  replyIndex: ReadonlyMap<number, ReadonlySet<number>>;
  /** 本文の HTML 化に使うプロトコル。本文と同じ URL を取り出すために共有する。 */
  messageProtocol: string;
  /** 本文で画像をぼかすレス番号と、ぼかしの強さ。 */
  blurredResNums: ReadonlySet<number>;
  imageBlurRadius: number;
  /** 公開した時刻。経過時間や勢いの基準にし、描画のたびに値が変わらないようにする。 */
  updatedAt: number;
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

/** 表示中のスレのスナップショットだけを返し、対象の切替直後に前のスレの情報を使わない。 */
export function useThreadSnapshot(tabId: string, threadUrl: string): ThreadSnapshot | undefined {
  const snapshot = useThreadSnapshots((store) => store.entries.get(tabId)?.snapshot);
  return snapshot?.threadUrl === threadUrl ? snapshot : undefined;
}
