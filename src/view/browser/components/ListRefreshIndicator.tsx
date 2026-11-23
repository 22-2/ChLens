import { Spinner } from "src/view/browser/ui/Spinner";

interface ListRefreshIndicatorProps {
  visible: boolean;
}

/**
 * 表示中の一覧を残したまま読み直しているときの小さな表示。
 *
 * 変更理由: 更新のたびに一覧を消して「読み込み中」に切り替えると、読んでいた位置を見失う。
 * 行はそのまま見せ、読み直していることだけを一覧の上に重ねて伝える。
 */
export function ListRefreshIndicator({ visible }: ListRefreshIndicatorProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="list-refresh-indicator" role="status">
      <Spinner size="xs" role="presentation" aria-hidden="true" />
      <span>更新中...</span>
    </div>
  );
}
