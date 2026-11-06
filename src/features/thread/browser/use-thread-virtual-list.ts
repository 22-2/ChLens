import {
  defaultRangeExtractor,
  elementScroll,
  type ReactVirtualizer,
  useVirtualizer,
} from "@tanstack/react-virtual";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { registerDebugStateProvider } from "src/app/debug/debug-api";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import {
  DEFAULT_RES_HEIGHT_METRICS,
  estimateResHeight,
  type ResHeightMetrics,
} from "src/features/thread/domain/res-height-estimate";
import type { IReadState, IRes } from "src/service-container/interfaces";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";
import { SCROLL_LAYOUT_CORRECTION_EVENT } from "src/view/browser/utils/scroll-layout-correction";

export type VirtualKey = string | number;

/** 過去実況の再生位置を示す線。レスと同じ並びに入れ、位置計算を共通にする。 */
export const REPLAY_LINE_KEY = "archive-replay-line";
export const READ_LINE_KEY = "thread-read-line";

export interface ThreadResponseLayout {
  getListTop: () => number | null;
  getResponseBox: (resNum: number) => { top: number; size: number } | null;
  forEachResponse: (callback: (resNum: number, top: number, size: number) => void) => void;
  subscribe: (listener: () => void) => () => void;
}

export interface ThreadScrollToResponseOptions {
  highlight?: boolean;
  offset?: number;
  align?: "start" | "center";
}

interface UseThreadVirtualListParams {
  responses: readonly IRes[];
  replayBoundary: number;
  readBoundary?: number;
  scrollContainerRef: RefObject<HTMLElement | null>;
  stickToEnd: boolean;
  debugKey: string;
  /** 表示中のタブか。非表示になる間に失われるスクロール位置を、表示へ戻ったときに復元する。 */
  isActive?: boolean;
}

export interface UseThreadVirtualListResult {
  virtualizer: ReactVirtualizer<HTMLElement, HTMLElement>;
  keys: readonly VirtualKey[];
  layout: ThreadResponseLayout;
  highlightKey: VirtualKey | null;
  onHighlightApplied: (key: VirtualKey) => void;
  highlightResponse: (resNum: number) => boolean;
  scrollToResponse: (resNum: number, options?: ThreadScrollToResponseOptions) => boolean;
  measureReadState: (
    received: number,
  ) => Pick<IReadState, "last" | "read" | "received" | "offset"> | null;
  hasResponse: (resNum: number) => boolean;
}

const BODY_HORIZONTAL_PADDING = 96;
const WIDTH_BUCKET_PX = 16;

/** スレッド一覧の描画・計測・ジャンプをTanStack Virtualへ委ねる。 */
export function useThreadVirtualList({
  responses,
  replayBoundary,
  readBoundary = -1,
  scrollContainerRef,
  stickToEnd,
  debugKey,
  isActive = true,
}: UseThreadVirtualListParams): UseThreadVirtualListResult {
  const { window: viewWindow } = useViewSurface();
  const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
  const ngDisplayMode = useNgDisplayMode();
  const [containerWidth, setContainerWidth] = useState(0);
  const [listTop, setListTop] = useState(0);
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0);
  const listenersRef = useRef(new Set<() => void>());
  const [pinnedKeys, setPinnedKeys] = useState<ReadonlySet<number>>(() => new Set());
  const metrics = useMemo<ResHeightMetrics>(
    () => ({
      ...DEFAULT_RES_HEIGHT_METRICS,
      contentWidth:
        containerWidth > 0
          ? Math.max(120, containerWidth - BODY_HORIZONTAL_PADDING)
          : DEFAULT_RES_HEIGHT_METRICS.contentWidth,
    }),
    [containerWidth],
  );
  const resByNum = useMemo(() => new Map(responses.map((res) => [res.num, res])), [responses]);
  const keys = useMemo<VirtualKey[]>(() => {
    const nums: VirtualKey[] = responses.map((res) => res.num);
    if (replayBoundary >= 0 && replayBoundary <= nums.length)
      nums.splice(replayBoundary, 0, REPLAY_LINE_KEY);
    if (readBoundary >= 0 && readBoundary <= responses.length) {
      const replayLineOffset = replayBoundary >= 0 && replayBoundary <= readBoundary ? 1 : 0;
      nums.splice(readBoundary + replayLineOffset, 0, READ_LINE_KEY);
    }
    return nums;
  }, [readBoundary, replayBoundary, responses]);
  // 同じレスの推定値はスクロール中に繰り返し求められるため、本文と幅が変わるまで再利用する。
  // 変更理由: レス配列は自動更新やライブ実況の1レスごとに作り直されるが、推定値は本文と幅だけで決まる。
  // 配列の入れ替えごとに捨てると、1000レス近いスレで更新のたびに全レスの推定（HTML除去と
  // 文字幅の計算）をやり直し、実スレの計測で自動更新中のscript時間の約4割を占めていた。
  // そのため本文の文字列を一緒に覚え、本文が変わったレスと幅が変わったときだけ求め直す。
  const estimateValues = useMemo(() => ({ resByNum, metrics }), [resByNum, metrics]);
  const estimateInput = useLatestRef(estimateValues);
  const estimateCacheRef = useRef<{
    metrics: ResHeightMetrics;
    entries: Map<number, { message: string; height: number }>;
  } | null>(null);
  const keyIndex = useMemo(() => new Map(keys.map((key, index) => [key, index])), [keys]);
  const estimateSize = useCallback(
    (index: number) => {
      const key = keys[index];
      if (typeof key !== "number") return estimateInput.current.metrics.chromeHeight;
      const res = estimateInput.current.resByNum.get(key);
      if (!res) return estimateInput.current.metrics.chromeHeight;
      let cache = estimateCacheRef.current;
      if (!cache || cache.metrics !== estimateInput.current.metrics) {
        cache = { metrics: estimateInput.current.metrics, entries: new Map() };
        estimateCacheRef.current = cache;
      }
      const cached = cache.entries.get(key);
      if (cached && cached.message === res.message) return cached.height;
      // NG非表示も最初は推定高さを持たせ、DOMにマウントして実測0を得る。
      // 推定から0にすると描画されず、NG解除後も要素を再計測できない。
      const height = estimateResHeight(res, estimateInput.current.metrics);
      cache.entries.set(key, { message: res.message, height });
      return height;
    },
    [estimateInput, keys],
  );
  // 変更理由: 非表示のタブは display:none になり、ブラウザがスクロール位置を0へ戻す。
  // 仮想リストは見ていた位置を覚えたままなので、戻っても位置を復元しないと、
  // 覚えている位置のレスだけが描画されて、先頭を見ている画面は空白になる。
  const isActiveRef = useLatestRef(isActive);
  const lastOffsetRef = useRef(0);
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: keys.length,
    getScrollElement: () => scrollContainerRef.current,
    scrollToFn: (offset, options, instance) => {
      elementScroll(offset, options, instance);
      // 実測高さによる補正を滑らかなスクロールへ伝え、慣性と競合させない。
      if (options.adjustments) {
        instance.scrollElement?.dispatchEvent(new Event(SCROLL_LAYOUT_CORRECTION_EVENT));
      }
    },
    getItemKey: (index) => keys[index]!,
    estimateSize,
    // 画面外から戻ったレスは画像や埋め込みの状態が以前と異なるため、
    // 再マウント時も古いキャッシュではなく現在の高さを計測する。
    measureElement: (element, entry) =>
      entry?.borderBoxSize?.[0]
        ? Math.round(entry.borderBoxSize[0].blockSize)
        : element.offsetHeight,
    overscan: 8,
    // レス内で非同期に埋め込みの高さが変わっても、Reactの次の描画を待たず後続レスを移動する。
    directDomUpdates: true,
    scrollMargin: listTop,
    // 先頭揃えのレスが固定ヘッダーの下に隠れないよう、実際の高さを使う。
    scrollPaddingStart: stickyHeaderHeight,
    rangeExtractor: (range) => {
      const indexes = new Set(defaultRangeExtractor(range));
      for (const num of pinnedKeys) {
        const index = keyIndex.get(num);
        if (index !== undefined) indexes.add(index);
      }
      return [...indexes].sort((a, b) => a - b);
    },
    onChange: (instance) => {
      // 非表示の間に起きるスクロール位置の初期化は、見ていた位置として記録しない。
      if (isActiveRef.current) lastOffsetRef.current = instance.scrollOffset ?? 0;
      for (const listener of listenersRef.current) listener();
    },
  });

  // 変更理由: 既定では、初めて計測した時に上端が画面の上にあるレスの高さの差を、スクロール位置へ足していた。
  // 画面の上端をまたぐレス自身の上端は動かないため、保存した読み位置（レスの上端からのずれ）を
  // 復元した直後に、そのレスの推定と実測の差（10px前後）だけ位置がずれていた。
  // 全体が画面の上に出ているレスだけを補正の対象にして、読んでいるレスの位置を保つ。
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
    item.end <= (instance.scrollOffset ?? 0) + instance.scrollAdjustments;

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const update = () => {
      if (container.clientWidth > 0) setContainerWidth(container.clientWidth);
      const header = container.querySelector<HTMLElement>(".thread-page__sticky-header");
      setStickyHeaderHeight(header?.getBoundingClientRect().height ?? 0);
      const list = container.querySelector<HTMLElement>(".thread-page__responses");
      if (list) {
        const next =
          list.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop;
        setListTop((current) => (current === next ? current : next));
      }
    };
    update();
    // 監視通知中に幅を更新すると、レスの再計測が通知を連鎖させる。
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (frame !== undefined) return;
      frame = viewWindow.requestAnimationFrame(() => {
        frame = undefined;
        update();
      });
    });
    observer.observe(container);
    const list = container.querySelector<HTMLElement>(".thread-page__responses");
    if (list) observer.observe(list);
    const stickyHeader = container.querySelector<HTMLElement>(".thread-page__sticky-header");
    if (stickyHeader) observer.observe(stickyHeader);
    return () => {
      observer.disconnect();
      if (frame !== undefined) viewWindow.cancelAnimationFrame(frame);
    };
  }, [scrollContainerRef, keys.length, viewWindow]);

  // NG表示方式や本文幅が変わったとき、以前の条件で測った高さを再利用しない。
  const displaySignature = useMemo(
    () =>
      keys.map((key) => {
        if (typeof key !== "number") return "replay";
        const res = resByNum.get(key);
        const hidden = !isNgTemporarilyDisabled && (res?.ng != null || res?.class?.includes("ng"));
        return `${Math.round(containerWidth / WIDTH_BUCKET_PX)}:${hidden ? resolveNgDisplayMode(ngDisplayMode, res?.ng) : "visible"}`;
      }),
    [containerWidth, isNgTemporarilyDisabled, keys, ngDisplayMode, resByNum],
  );
  const signatureRef = useRef<Map<VirtualKey, string>>(new Map());
  useLayoutEffect(() => {
    let correctionFrame: number | undefined;
    const changed = displaySignature.some((signature, index) => {
      const key = keys[index]!;
      const previous = signatureRef.current.get(key);
      return previous !== undefined && previous !== signature;
    });
    if (changed) {
      const container = scrollContainerRef.current;
      // 幅の変更で画面外の推定高さも変わるため、現在のレスと画面内の位置を基準に戻す。
      const anchor =
        container && !stickToEnd
          ? virtualizer.measurementsCache.find(
              (item) =>
                typeof item.key === "number" && item.end > container.scrollTop + stickyHeaderHeight,
            )
          : undefined;
      const anchorOffset = anchor && container ? anchor.start - container.scrollTop : 0;
      virtualizer.measure();
      // 幅が変わっても高さが同じ要素には ResizeObserver の通知が来ない。
      // キャッシュ消去後に描画中の要素を実測しないと、推定値のまま余白や重なりが残る。
      for (const [key, element] of virtualizer.elementsCache) {
        if (!element.isConnected) continue;
        const index = virtualizer.indexFromElement(element);
        if (index >= 0 && index < keys.length && keys[index] === key) {
          virtualizer.resizeItem(index, element.offsetHeight);
        }
      }
      if (stickToEnd && container) {
        // 遅らせた幅の再計測で末尾が動く前の追従意図を維持する。
        virtualizer.scrollToEnd();
      }
      if (anchor && typeof anchor.key === "number" && container) {
        const index = keyIndex.get(anchor.key);
        const updated = index === undefined ? undefined : virtualizer.measurementsCache[index];
        if (updated) {
          virtualizer.scrollToOffset(updated.start - anchorOffset);
          // 描画範囲の実測で推定がさらに変わるため、次の描画後に同じレスの位置を補正する。
          correctionFrame = viewWindow.requestAnimationFrame(() => {
            const element = virtualizer.elementsCache.get(anchor.key);
            if (!element?.isConnected || !container.isConnected) return;
            const actualOffset =
              element.getBoundingClientRect().top - container.getBoundingClientRect().top;
            container.scrollTop += actualOffset - anchorOffset;
          });
        }
      }
    }
    signatureRef.current = new Map(
      displaySignature.map((signature, index) => [keys[index]!, signature]),
    );
    return () => {
      if (correctionFrame !== undefined) viewWindow.cancelAnimationFrame(correctionFrame);
    };
  }, [
    displaySignature,
    keyIndex,
    keys,
    scrollContainerRef,
    stickyHeaderHeight,
    stickToEnd,
    viewWindow,
    virtualizer,
  ]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!isActive || !container || lastOffsetRef.current <= 0) return;
    virtualizer.scrollToOffset(lastOffsetRef.current);
    // 位置がすでに合っているとscrollイベントは出ず、仮想リストの内部の位置が古いまま残るため、読み直させる。
    container.dispatchEvent(new Event("scroll"));
  }, [isActive, scrollContainerRef, virtualizer]);

  const previousKeyCountRef = useRef(keys.length);
  useLayoutEffect(() => {
    const previousCount = previousKeyCountRef.current;
    previousKeyCountRef.current = keys.length;
    // 追従の再開だけでは内容が増えていないため、仮想リストのスクロールを再始動しない。
    if (keys.length === previousCount || !stickToEnd || !virtualizer.isAtEnd(1)) return;
    virtualizer.scrollToEnd();
  }, [keys.length, stickToEnd, virtualizer]);

  useEffect(() => {
    const viewDocument = viewWindow.document;
    const handleSelectionChange = () => {
      const selection = viewDocument.getSelection();
      const pinned =
        selection && !selection.isCollapsed
          ? [selection.anchorNode, selection.focusNode]
              .map(findResponseNum)
              .filter((num): num is number => num !== null)
          : [];
      setPinnedKeys(new Set(pinned));
    };
    viewDocument.addEventListener("selectionchange", handleSelectionChange);
    return () => viewDocument.removeEventListener("selectionchange", handleSelectionChange);
  }, [viewWindow, virtualizer]);

  const [highlightKey, setHighlightKey] = useState<VirtualKey | null>(null);
  const onHighlightApplied = useCallback(
    (key: VirtualKey) => setHighlightKey((current) => (current === key ? null : current)),
    [],
  );
  const scrollToResponse = useCallback(
    (resNum: number, options: ThreadScrollToResponseOptions = {}) => {
      const index = keyIndex.get(resNum);
      if (index === undefined || !virtualizer.scrollElement) return false;
      const item = virtualizer.measurementsCache[index];
      // 保存した画面内の位置まで同じ描画前に移動し、先頭揃えからの二段階移動を防ぐ。
      if (options.offset != null && item) virtualizer.scrollToOffset(item.start - options.offset);
      else virtualizer.scrollToIndex(index, { align: options.align ?? "start" });
      if (options.highlight ?? true) setHighlightKey(resNum);
      return true;
    },
    [keyIndex, virtualizer],
  );
  const highlightResponse = useCallback(
    (resNum: number) => {
      if (!keyIndex.has(resNum)) return false;
      setHighlightKey(resNum);
      return true;
    },
    [keyIndex],
  );
  const getEntries = useCallback(() => virtualizer.measurementsCache, [virtualizer]);
  const layout = useMemo<ThreadResponseLayout>(
    () => ({
      getListTop: () => listTop,
      getResponseBox: (resNum) => {
        const index = keyIndex.get(resNum);
        const item = index === undefined ? undefined : getEntries()[index];
        return item ? { top: item.start - listTop, size: item.size } : null;
      },
      forEachResponse: (callback) =>
        getEntries().forEach((item, index) => {
          const key = keys[index];
          if (typeof key === "number") callback(key, item.start - listTop, item.size);
        }),
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
    }),
    [getEntries, keyIndex, keys, listTop],
  );
  const measureReadState = useCallback(
    (received: number) => {
      const container = scrollContainerRef.current;
      if (!container || received <= 0) return null;
      const visible = getEntries().filter(
        (item) =>
          item.end > container.scrollTop &&
          item.start < container.scrollTop + container.clientHeight,
      );
      const resItems = visible.filter((item) => typeof item.key === "number");
      const first = resItems[0];
      const last = resItems.at(-1);
      if (!first || !last) return null;
      return {
        last: first.key as number,
        read: Math.max(first.key as number, last.key as number),
        received,
        offset: Math.round(first.start - container.scrollTop),
      };
    },
    [getEntries, scrollContainerRef],
  );
  const hasResponse = useCallback((resNum: number) => keyIndex.has(resNum), [keyIndex]);

  useEffect(
    () =>
      registerDebugStateProvider(debugKey, () => ({
        totalSize: virtualizer.getTotalSize(),
        renderedKeys: virtualizer.getVirtualItems().map((item) => item.key),
        itemCount: keys.length,
        measuredCount: virtualizer.measurementsCache.length,
        estimatedCount:
          keys.length -
          virtualizer.measurementsCache.filter((item) => virtualizer.itemSizeCache.has(item.key))
            .length,
      })),
    [debugKey, keys.length, virtualizer],
  );

  return {
    virtualizer,
    keys,
    layout,
    highlightKey,
    onHighlightApplied,
    highlightResponse,
    scrollToResponse,
    measureReadState,
    hasResponse,
  };
}

function findResponseNum(node: Node | null): number | null {
  const element =
    node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node?.parentElement ?? null);
  const num = Number.parseInt(
    element?.closest<HTMLElement>("[data-res-num]")?.dataset.resNum ?? "",
    10,
  );
  return Number.isFinite(num) ? num : null;
}
