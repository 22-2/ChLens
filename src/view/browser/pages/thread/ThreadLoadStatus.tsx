import { Spinner } from "src/view/browser/ui/Spinner";

/** 初回読み込みと、本文が取得できなかった場合の再試行を示す。 */
export function ThreadLoadStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div className="page-status">
        <Spinner size="sm" aria-label="スレッドを読み込み中" />
        <span>スレッドを読み込み中...</span>
      </div>
    );
  return (
    <div className="page-status page-status--error">
      <p>{error}</p>
      <button className="page-status__retry" onClick={onRetry}>
        再試行
      </button>
    </div>
  );
}
