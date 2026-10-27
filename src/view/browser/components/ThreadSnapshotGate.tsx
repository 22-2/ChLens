import type { ReactNode } from "react";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
import { type ThreadSnapshot, useThreadSnapshot } from "src/view/browser/state/thread-snapshot";

/**
 * スナップショットを使うビューに共通の「取得できない・読み込み中・エラー」を表示し、
 * 表示できるときだけ表示中のスレのスナップショットを children に渡す。
 * 取得済みのレスがあれば、更新に失敗しても手元のレスで表示を続ける。
 */
export function ThreadSnapshotGate({
  tabId,
  threadUrl,
  children,
}: {
  tabId: string;
  threadUrl: string;
  children: (snapshot: ThreadSnapshot) => ReactNode;
}) {
  const snapshot = useThreadSnapshot(tabId, threadUrl);
  if (!snapshot) return <SidePanelMessage>スレッドの情報を取得できません。</SidePanelMessage>;
  if (snapshot.loading) return <SidePanelMessage>スレッドを読み込み中…</SidePanelMessage>;
  if (snapshot.error && snapshot.responses.length === 0) {
    return <SidePanelMessage>{snapshot.error}</SidePanelMessage>;
  }
  return children(snapshot);
}
