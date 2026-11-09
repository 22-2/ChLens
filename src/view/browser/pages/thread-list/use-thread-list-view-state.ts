import { useEffect, useRef, useState } from "react";
import { resolveSortPreference } from "src/features/thread-list/ui/thread-list-display";
import {
  type ThreadListSortPreference,
  writeThreadListSortPreference,
} from "src/features/thread-list/ui/thread-list-shared";
import { useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import type { ThreadListPage } from "src/view/browser/types";
import {
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
} from "src/view/browser/utils/search-normalize";

/**
 * スレ一覧の並べ替え・検索語・検索オプションを持ち、タブの view state と板別の並べ替え設定へ保存する。
 */
export function useThreadListViewState(tabId: string, page: ThreadListPage) {
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, page);
  const persistedSearchQuery = persistedViewState.searchQuery;
  const persistedSortColumn = persistedViewState.sortColumn;
  const persistedSortDirection = persistedViewState.sortDirection;
  const [sortPreference, setSortPreference] = useState<ThreadListSortPreference>(() =>
    resolveSortPreference(persistedSortColumn, persistedSortDirection, page.boardUrl),
  );
  const [searchQuery, setSearchQuery] = useState(() => persistedSearchQuery ?? "");
  // 切り替えは検索欄の使い方の好みに近いため、板を移っても引き継ぎ、タブの復元時に戻す。
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(() => ({
    ...DEFAULT_SEARCH_OPTIONS,
    ...persistedViewState.searchOptions,
  }));
  const previousBoardUrlRef = useRef(page.boardUrl);
  const skipViewStateUpdateRef = useRef(false);

  useEffect(() => {
    if (previousBoardUrlRef.current === page.boardUrl) {
      return;
    }

    // 保存値は板を切り替えたときだけ復元する。入力中にも view state が更新されるため、
    // そのたびに同じ値をローカル状態へ戻すと、入力イベントと競合して文字が点滅する。
    previousBoardUrlRef.current = page.boardUrl;
    // 板切り替え直後は、復元前のローカル状態を新しい板へ保存しない。
    skipViewStateUpdateRef.current = true;
    const restoredSortPreference = resolveSortPreference(
      persistedSortColumn,
      persistedSortDirection,
      page.boardUrl,
    );
    setSortPreference((previous) =>
      previous.column === restoredSortPreference.column &&
      previous.direction === restoredSortPreference.direction
        ? previous
        : restoredSortPreference,
    );
    setSearchQuery(persistedSearchQuery ?? "");
  }, [page.boardUrl, persistedSearchQuery, persistedSortColumn, persistedSortDirection]);

  useEffect(() => {
    if (skipViewStateUpdateRef.current) {
      skipViewStateUpdateRef.current = false;
      return;
    }

    updateViewState({
      searchQuery,
      searchOptions,
      sortColumn: sortPreference.column,
      sortDirection: sortPreference.direction,
    });
  }, [searchOptions, searchQuery, sortPreference, updateViewState]);

  useEffect(() => {
    writeThreadListSortPreference(page.boardUrl, sortPreference);
  }, [page.boardUrl, sortPreference]);

  return {
    sortPreference,
    setSortPreference,
    searchQuery,
    setSearchQuery,
    searchOptions,
    setSearchOptions,
  };
}
