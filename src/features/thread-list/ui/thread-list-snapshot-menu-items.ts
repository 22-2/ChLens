import type { ThreadListSnapshot } from "src/features/thread-list/ui/thread-list-snapshots";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { formatRelativeTime } from "src/view/browser/utils/date-time";

interface SnapshotMenuItemsOptions {
  snapshots: readonly ThreadListSnapshot[];
  selectedSnapshot: ThreadListSnapshot | null;
  /** 相対時刻の基準。メニューを開いた時点を渡し、開くたびに経過時間を計算し直す。 */
  now: number;
  onSelect: (snapshot: ThreadListSnapshot | null) => void;
}

// 変更理由: タイトルバーとナビゲーションバーの更新メニューで同じ履歴項目を出すため、
// 表示形式（秒単位の経過時間・件数・選択中の印）を一か所に揃える。
export function createSnapshotMenuItems({
  snapshots,
  selectedSnapshot,
  now,
  onSelect,
}: SnapshotMenuItemsOptions): ContextMenuItem[] {
  return [
    {
      id: "snapshot-latest",
      label: `${selectedSnapshot ? "" : "✓ "}最新の一覧`,
      onSelect: () => onSelect(null),
    },
    ...snapshots.map((snapshot) => ({
      id: snapshot.url,
      label: `${selectedSnapshot?.url === snapshot.url ? "✓ " : ""}${formatRelativeTime(
        snapshot.last_updated,
        now,
        { showSeconds: true },
      )}（${snapshot.threads.length}件）`,
      onSelect: () => onSelect(snapshot),
    })),
  ];
}
