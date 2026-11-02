/** dat落ちと取得エラーを、本文の上部の通知として表示する。 */
export function ThreadPageNotices({
  expired,
  missingFromSubject,
  error,
  isNextThreadWaiting,
  onCancelNextThreadWaiting,
  onSearchRelatedThreads,
}: {
  expired: boolean;
  missingFromSubject: boolean;
  error: string | null;
  isNextThreadWaiting?: boolean;
  onCancelNextThreadWaiting?: () => void;
  onSearchRelatedThreads?: () => Promise<void>;
}) {
  return (
    <>
      {isNextThreadWaiting && (
        <div className="thread-page__notice thread-page__notice--expired" role="status">
          <span>次スレを待機中です</span>
          <button type="button" className="browser-button" onClick={onCancelNextThreadWaiting}>
            キャンセル
          </button>
        </div>
      )}
      {(expired || missingFromSubject) && (
        <div className="thread-page__notice thread-page__notice--expired" role="status">
          <span>このスレッドはdat落ちしています</span>
          {onSearchRelatedThreads ? (
            <button
              type="button"
              className="browser-button"
              onClick={() => void onSearchRelatedThreads()}
            >
              関連スレを探す
            </button>
          ) : null}
        </div>
      )}
      {error && <div className="thread-page__notice">{error}</div>}
    </>
  );
}
