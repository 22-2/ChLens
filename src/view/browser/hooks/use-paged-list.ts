import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import { useDelayedFlag } from "src/view/browser/hooks/use-delayed-flag";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { type ListLoadPage, recordListLoad } from "src/view/browser/utils/list-load-debug";

const logger = createLogger("view/browser");

export interface PagedListFetchRequest<TRow> {
  /** 保存先の並びで読み始める位置。 */
  offset: number;
  /** この位置まで読む。読み直しでは読み込み済みの範囲を保つため、前回読んだ位置が入る。 */
  targetOffset: number;
  /** 追加の読み込みでは読み込み済みの行、先頭からの読み直しでは空の配列。 */
  loadedRows: readonly TRow[];
}

export interface PagedListRange<TRow> {
  rows: TRow[];
  /** 次に読み始める位置。重複を除く一覧では、表示する行数と一致しないことがある。 */
  nextOffset: number;
  hasMore: boolean;
}

interface UsePagedListOptions<TRow> {
  page: ListLoadPage;
  pageSize: number;
  /** 取得に失敗したときにログと画面へ出す文言。 */
  errorMessage: string;
  fetchRange: (request: PagedListFetchRequest<TRow>) => Promise<PagedListRange<TRow>>;
  /** 検索やソートは未読込のページが残っていると結果が欠けるため、そのあいだは残りを読み切る。 */
  loadCompleteDataset?: boolean;
}

/**
 * 閲覧履歴・書き込み履歴・ログの一覧を、保存先から少しずつ読む。
 *
 * 変更理由: 以前は前回の一覧を別に保存して先に見せ、読み終えたら丸ごと差し替えていたため、
 * 古い一覧が数秒見えたあとで突然入れ替わっていた。3つの一覧を次の動きにそろえる。
 * - 最初は保存先の先頭ページを直接表示し、待ち表示は待ちが続いたときだけ出す
 * - 読み直しでは表示中の行を残し、読み込み済みの範囲を保ったまま一度に差し替える
 * - 読み直しに失敗しても表示中の行は消さない
 */
export function usePagedList<TRow>({
  page,
  pageSize,
  errorMessage,
  fetchRange,
  loadCompleteDataset = false,
}: UsePagedListOptions<TRow>) {
  const [rows, setRows] = useState<TRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 変更理由: 0件の一覧を読み直すたびに空の表から「読み込み中」へ戻ってちらつかないよう、
  // 行数ではなく一度読み終えたかどうかで最初の読み込みを判定する。
  const [hasLoaded, setHasLoaded] = useState(false);
  const rowsRef = useRef<TRow[]>([]);
  const nextOffsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isLoadingRef = useRef(false);
  const pendingReloadRef = useRef(false);
  // 呼び出し側が毎回新しい関数を渡しても、読み込み関数を作り直して再読込が連鎖しないようにする。
  const fetchRangeRef = useLatestRef(fetchRange);

  const load = useCallback(
    async function load(reset: boolean): Promise<void> {
      if (isLoadingRef.current) {
        // 読込中に届いた更新通知を捨てず、完了後に一度だけ読み直す。
        pendingReloadRef.current ||= reset;
        return;
      }
      if (!reset && !hasMoreRef.current) {
        return;
      }

      isLoadingRef.current = true;
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const startedAt = performance.now();
      const offset = reset ? 0 : nextOffsetRef.current;
      const targetOffset = reset ? Math.max(nextOffsetRef.current, pageSize) : offset + pageSize;
      try {
        const range = await fetchRangeRef.current({
          offset,
          targetOffset,
          loadedRows: reset ? [] : rowsRef.current,
        });
        const nextRows = reset ? range.rows : [...rowsRef.current, ...range.rows];
        rowsRef.current = nextRows;
        nextOffsetRef.current = range.nextOffset;
        hasMoreRef.current = range.hasMore;
        setRows(nextRows);
        setHasMore(range.hasMore);
        recordListLoad(page, { reset, rows: range.rows.length, startedAt });
      } catch (e) {
        logger.error(errorMessage, e);
        setError(e instanceof Error ? e.message : errorMessage);
      } finally {
        isLoadingRef.current = false;
        if (reset) {
          setLoading(false);
          setHasLoaded(true);
        } else {
          setLoadingMore(false);
        }
      }

      if (pendingReloadRef.current) {
        pendingReloadRef.current = false;
        await load(true);
      }
    },
    [errorMessage, fetchRangeRef, page, pageSize],
  );

  const reload = useCallback(() => load(true), [load]);

  /** 未読数の通知など、読み直さずに表示中の行だけを書き換える。 */
  const updateRows = useCallback((update: (rows: TRow[]) => TRow[]) => {
    const nextRows = update(rowsRef.current);
    rowsRef.current = nextRows;
    setRows(nextRows);
  }, []);

  const loadMore = useCallback(() => {
    // 読み切り中は loadCompleteDataset の effect が続きを読むので、スクロール終端では読まない。
    if (loadCompleteDataset || loading || loadingMore || error || !hasMore) {
      return;
    }
    void load(false);
  }, [error, hasMore, load, loadCompleteDataset, loading, loadingMore]);

  useEffect(() => {
    if (!loadCompleteDataset || loading || loadingMore || error || !hasMore) {
      return;
    }
    void load(false);
  }, [error, hasMore, load, loadCompleteDataset, loading, loadingMore]);

  const isInitialLoading = loading && !hasLoaded;
  const showInitialLoading = useDelayedFlag(isInitialLoading);
  const showRefreshing = useDelayedFlag(loading && hasLoaded);

  return {
    rows,
    loadingMore,
    error,
    reload,
    loadMore,
    updateRows,
    /** まだ1行も表示していない最初の読み込み中。 */
    isInitialLoading,
    /** 最初の読み込みが長引いているので「読み込み中」を出す。 */
    showInitialLoading,
    /** 表示中の行を残したままの読み直しが長引いているので、更新中の表示を出す。 */
    showRefreshing,
  };
}
