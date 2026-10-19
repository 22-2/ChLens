import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadScrollToResponseOptions } from "src/features/thread/browser/use-thread-virtual-list";
import {
  buildThreadFindIndex,
  type FindableRes,
  findStartIndex,
  findThreadMatches,
  stepMatchIndex,
  type ThreadFindMatch,
} from "src/features/thread/domain/thread-find";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

interface UseThreadFindParams {
  isActive: boolean;
  /** 表示中の並び（絞り込み後）。見えていないレスの一致へ移っても表示できるものだけを探す。 */
  responses: readonly FindableRes[];
  scrollToResponse: (resNum: number, options?: ThreadScrollToResponseOptions) => boolean;
  /** 検索を始めるときに基準にする、いま見ているレス。 */
  getTopVisibleResNum: () => number | null;
  /** 現在の一致の強調を探すスレッドのルート。 */
  rootRef: React.RefObject<HTMLElement | null>;
}

export interface UseThreadFindResult {
  isOpen: boolean;
  query: string;
  /** レスの強調に使う検索語（前後の空白を除いたもの）。閉じているときは空。 */
  highlightQuery: string;
  setQuery: (query: string) => void;
  total: number;
  /** 0始まり。一致がなければ -1。 */
  activeIndex: number;
  activeMatch: ThreadFindMatch | null;
  /** 開くたびに増える番号。入力欄へフォーカスし直す合図に使う。 */
  focusKey: number;
  open: () => void;
  close: () => void;
  next: () => void;
  previous: () => void;
}

const CURRENT_MATCH_SELECTOR = ".res__find-match--current";

/**
 * スレッドのページ内検索（Ctrl+F の置き換え）。
 *
 * ブラウザの検索は描画しているレスしか探せないため、Ctrl+F を奪って表示中の並びのデータから探す。
 * 一致したレスへは位置計算でジャンプし、レスの中で現在の一致がまだ表示領域の外にあれば
 * （長いレスの下の方など）、その強調が見える位置まで動かす。
 */
export function useThreadFind({
  isActive,
  responses,
  scrollToResponse,
  getTopVisibleResNum,
  rootRef,
}: UseThreadFindParams): UseThreadFindResult {
  const { window: viewWindow } = useViewSurface();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focusKey, setFocusKey] = useState(0);
  // 打鍵ごとに全レスを探すと入力が重くなるため、探す処理は入力より後回しにしてよい。
  const deferredQuery = useDeferredValue(isOpen ? query.trim() : "");
  const index = useMemo(() => buildThreadFindIndex(responses), [responses]);
  const matches = useMemo(() => findThreadMatches(index, deferredQuery), [deferredQuery, index]);
  const activeMatch = activeIndex >= 0 ? (matches[activeIndex] ?? null) : null;

  const revealMatch = useCallback(
    (match: ThreadFindMatch | null) => {
      if (!match) return;
      scrollToResponse(match.resNum, { align: "center", highlight: false });
      // レスの中心を表示領域の中心に置いても、長いレスでは一致が画面外に残ることがある。
      // 描画が済んだ次のフレームで、現在の一致の強調が見えていなければそこまで動かす。
      viewWindow.requestAnimationFrame(() => {
        const root = rootRef.current;
        const mark = root?.querySelector(CURRENT_MATCH_SELECTOR);
        const panel = root?.closest(".content-area__tab-panel");
        if (!mark || !panel) return;
        const rect = mark.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        if (rect.top < panelRect.top || rect.bottom > panelRect.bottom) {
          mark.scrollIntoView({ block: "center" });
        }
      });
    },
    [rootRef, scrollToResponse, viewWindow],
  );

  // 検索語が変わったら、いま見ているレス以降の最初の一致を選ぶ（読んでいる位置から飛ばさない）。
  const getTopVisibleResNumRef = useLatestRef(getTopVisibleResNum);
  const revealMatchRef = useLatestRef(revealMatch);
  const lastSearchedRef = useRef<{ query: string; index: typeof index } | null>(null);
  useEffect(() => {
    const previous = lastSearchedRef.current;
    lastSearchedRef.current = { query: deferredQuery, index };
    if (previous?.query === deferredQuery) {
      // 新着などで並びだけが変わったときは、選んでいた一致の位置を保つ。
      setActiveIndex((current) => Math.min(current, matches.length - 1));
      return;
    }
    const start = findStartIndex(matches, getTopVisibleResNumRef.current() ?? 0);
    setActiveIndex(start);
    revealMatchRef.current(matches[start] ?? null);
  }, [deferredQuery, getTopVisibleResNumRef, index, matches, revealMatchRef]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const nextIndex = stepMatchIndex(activeIndex, matches.length, direction);
      setActiveIndex(nextIndex);
      revealMatch(matches[nextIndex] ?? null);
    },
    [activeIndex, matches, revealMatch],
  );
  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => step(-1), [step]);

  const open = useCallback(() => {
    setIsOpen(true);
    setFocusKey((key) => key + 1);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);
  const setQuery = useCallback((nextQuery: string) => setQueryState(nextQuery), []);

  const stepRef = useLatestRef(step);
  const isOpenRef = useLatestRef(isOpen);
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      // 変更理由: ブラウザのページ内検索は仮想スクロールで描画していないレスを探せないため、
      // 表示中のスレッドでは Ctrl+F をこの検索に置き換える。
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === "f") {
        event.preventDefault();
        open();
        return;
      }
      if (event.key === "F3" && isOpenRef.current) {
        event.preventDefault();
        stepRef.current(event.shiftKey ? -1 : 1);
      }
    };
    viewWindow.addEventListener("keydown", handleKeyDown);
    return () => viewWindow.removeEventListener("keydown", handleKeyDown);
  }, [isActive, isOpenRef, open, stepRef, viewWindow]);

  return {
    isOpen,
    query,
    highlightQuery: isOpen ? query.trim() : "",
    setQuery,
    total: matches.length,
    activeIndex,
    activeMatch,
    focusKey,
    open,
    close,
    next,
    previous,
  };
}
