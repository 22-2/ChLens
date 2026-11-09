import { ChURL } from "packages/chlib/src/index";
import { useEffect, useRef } from "react";
import { createLogger } from "src/app/logger";
import { isResolvedBoardTitle } from "src/features/board/domain/board-list-utils";
import type { useTabViewRuntime } from "src/features/tabs/browser/use-tab-view-runtime";
import { container } from "src/service-container/index";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ThreadListPage } from "src/view/browser/types";

const logger = createLogger("view/browser");

function resolveInitialBoardTitle(page: ThreadListPage): string | null {
  if (isResolvedBoardTitle(page.boardUrl, page.title)) {
    return page.title;
  }

  if (isResolvedBoardTitle(page.boardUrl, page.boardTitle)) {
    return page.boardTitle;
  }

  return null;
}

interface UseThreadListBoardRecordOptions {
  tabId: string;
  page: ThreadListPage;
  isActive: boolean;
  dispatch: ReturnType<typeof useTabViewRuntime>["dispatch"];
}

/**
 * 開いた板の記録（板名・最終閲覧日時）と、タブタイトルへの板名の反映を担当する。
 * 返す2つの ref は、スレ一覧の取得完了後の保存でも同じ値を使うために共有する。
 */
export function useThreadListBoardRecord({
  tabId,
  page,
  isActive,
  dispatch,
}: UseThreadListBoardRecordOptions) {
  const visitedBoardRef = useRef<{ url: string; lastVisited: number } | null>(null);
  const resolvedBoardTitlesRef = useRef(new Map<string, string>());
  const initialBoardTitle = resolveInitialBoardTitle(page);

  useEffect(() => {
    // スレ一覧の取得より前に名前が分かる経路も、取得確認後の保存へ引き継ぐ。
    if (initialBoardTitle) resolvedBoardTitlesRef.current.set(page.boardUrl, initialBoardTitle);
  }, [initialBoardTitle, page.boardUrl]);

  useEffect(() => {
    container.openedBoards.upsertOpenedBoardEntry(page.boardUrl, initialBoardTitle);
  }, [initialBoardTitle, page.boardUrl]);

  useEffect(() => {
    // スレを開かず板だけを開いた場合や既存タブの再選択も記録する。板名解決では日時を進めない。
    if (visitedBoardRef.current?.url !== page.boardUrl || isActive) {
      visitedBoardRef.current = { url: page.boardUrl, lastVisited: Date.now() };
      container.openedBoards.upsertOpenedBoardEntry(
        page.boardUrl,
        null,
        visitedBoardRef.current.lastVisited,
      );
    }
  }, [isActive, page.boardUrl]);

  useEffect(() => {
    let cancelled = false;

    // 変更理由: スレ一覧コンポーネントは再マウントされない経路があるため、
    // 「初回だけ取得」だと別板へ遷移した後のタイトルが更新されないことがある。
    if (initialBoardTitle) {
      if (initialBoardTitle !== page.title) {
        dispatch(tabActions.updateTitleForTab(tabId, initialBoardTitle, page.boardUrl));
      }
      return;
    }

    container.boardTitle
      .ask(new ChURL(page.boardUrl))
      .then((title) => {
        if (title && isResolvedBoardTitle(page.boardUrl, title)) {
          resolvedBoardTitlesRef.current.set(page.boardUrl, title);
          // タブの再描画を保存の前提にせず、遷移後に届いた名前も元の板へ残す。
          // 板名解決の遅延では閲覧日時を進めず、板を開いた時刻をそのまま保つ。
          container.openedBoards.upsertOpenedBoardEntry(page.boardUrl, title);
        }
        if (!cancelled && title) {
          dispatch(tabActions.updateTitleForTab(tabId, title, page.boardUrl));
        }
      })
      .catch((err) => {
        logger.error(err);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, initialBoardTitle, page.boardUrl, page.title, tabId]);

  return { visitedBoardRef, resolvedBoardTitlesRef };
}
