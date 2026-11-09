import { DragDropProvider, DragOverlay, KeyboardSensor } from "@dnd-kit/react";
import { PanelLeftClose, PanelLeftOpen, Pin, Play, Plus, X } from "lucide-react";
import React, { useCallback, useRef } from "react";
import { type TabBarItem } from "src/features/tabs/browser/tab-bar-layout";
import { useNewTabHighlight } from "src/features/tabs/browser/use-new-tab-highlight";
import { useTabBarWheelSwitch } from "src/features/tabs/browser/use-tab-bar-wheel-switch";
import { useTabBarWidthResize } from "src/features/tabs/browser/use-tab-bar-width-resize";
import { useTabDragTracking } from "src/features/tabs/browser/use-tab-drag-tracking";
import { useTabListScroll } from "src/features/tabs/browser/use-tab-list-scroll";
import { useCursorTooltip } from "src/view/browser/components/CursorTooltip";
import { PageTypeIcon } from "src/view/browser/components/PageTypeIcon";
import { useSortableTab, WindowPointerSensor } from "src/view/browser/components/sortable-tab";
import type { Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

interface SortableTabProps {
  tab: Tab;
  index: number;
  isActive: boolean;
  isHighlighted: boolean;
  autoRefreshIndicatorState: TabBarItem["autoRefreshIndicatorState"];
  isArchiveReplayThread?: boolean;
  canClose: boolean;
  isVertical: boolean;
  compact: boolean;
  /** 表示中だがフォーカスのないペインのタブかどうか。 */
  isPaneUnfocused?: boolean;
  wasDraggingRef: React.MutableRefObject<boolean>;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tab: Tab) => void;
  onArrowNavigate: (index: number, delta: number) => void;
}

// タブ1枚分の Sortable ラッパー。
interface AutoRefreshIndicatorProps {
  state: "active" | "inactive";
}

/**
 * 自動更新の動作中（赤い三角）と待機中（青い四角）を示す。
 * 変更理由: 簡易表示では既存のページアイコンと置き換え、広い表示では右端に置くため、
 * 配置を呼び出し側で決められるように部品として分けている。
 */
const AutoRefreshIndicator: React.FC<AutoRefreshIndicatorProps> = ({ state }) => (
  <span
    className={`tab__auto-refresh-indicator${
      state === "inactive" ? " tab__auto-refresh-indicator--inactive" : ""
    }`}
    title={state === "active" ? "自動更新: 動作中" : "自動更新: 待機中"}
    aria-label={state === "active" ? "自動更新動作中" : "自動更新待機中"}
  />
);

// タブ1枚分の Sortable ラッパー。
// useSortable は各タブが独自に DragDropManager と紐付くため、TabBar 外のコンポーネントとして定義する。
const SortableTab: React.FC<SortableTabProps> = ({
  tab,
  index,
  isActive,
  isHighlighted,
  autoRefreshIndicatorState,
  isArchiveReplayThread = false,
  canClose,
  isVertical,
  compact,
  isPaneUnfocused = false,
  wasDraggingRef,
  onSelect,
  onClose,
  onContextMenu,
  onArrowNavigate,
}) => {
  const { ref, isDragSource } = useSortableTab({
    id: tab.id,
    index,
    // ピン留めと通常の境界を越えないようグループを分ける。
    group: tab.pinned ? "pinned" : "normal",
  });

  const page = getCurrentPage(tab);
  // 変更理由: 垂直タブの隣に開く設定メニューはポップアップ階層にあるため、
  // タブ名のツールチップだけをその上へ重ねる。
  const { show, move, hide, tooltip } = useCursorTooltip({ abovePopups: isVertical });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 中クリックはドラッグではなく閉じる操作として処理する。
      if (e.button === 1) {
        e.preventDefault();
        hide();
        onClose(tab.id);
      }
    },
    [hide, tab.id, onClose],
  );

  const handleClick = useCallback(() => {
    // ドラッグ終了直後に合成される click でタブが切り替わるのを1回だけ抑止する。
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      hide();
      return;
    }
    hide();
    onSelect(tab.id);
  }, [hide, tab.id, wasDraggingRef, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 変更理由: 垂直モードでは上下、水平モードでは左右でタブ間を移動できるようにし、
      // マウスに頼らないタブ切り替え手段を方向ごとに保つ。
      const nextKey = isVertical ? "ArrowDown" : "ArrowRight";
      const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";
      const delta = e.key === nextKey ? 1 : e.key === prevKey ? -1 : 0;
      if (delta === 0) {
        return;
      }
      e.preventDefault();
      onArrowNavigate(index, delta);
    },
    [index, isVertical, onArrowNavigate],
  );

  return (
    <>
      <div
        ref={ref}
        className={`tab${isActive ? " tab--active" : ""}${
          isPaneUnfocused ? " tab--pane-unfocused" : ""
        }${
          tab.pinned ? " tab--pinned" : ""
        }${isHighlighted ? " tab--highlighted" : ""}${isDragSource ? " tab--dragging" : ""}`}
        data-tab-id={tab.id}
        role="tab"
        aria-selected={isActive}
        // 変更理由: 簡易表示ではタイトルを隠すため、支援技術向けに名前を補う。
        aria-label={compact ? page.title : undefined}
        tabIndex={isActive ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseEnter={(event) => show(page.title, event)}
        onMouseMove={(event) => move(page.title, event)}
        onMouseLeave={hide}
        onContextMenu={(e) => {
          hide();
          onContextMenu(e, tab);
        }}
      >
        {/* ホームも他のページと同じタブ表示を使い、固定は利用者の選択に従う。 */}
        {compact ? (
          <span
            className={`tab__icon${isArchiveReplayThread ? " tab__icon--archive-replay" : ""}`}
            title={isArchiveReplayThread ? "過去実況の再生対象" : undefined}
          >
            {/* 変更理由: 簡易表示では自動更新の状態をページアイコンに重ねず、アイコンと置き換える。 */}
            {tab.pinned ? (
              <Pin size={11} />
            ) : isArchiveReplayThread ? (
              <Play size={15} fill="currentColor" aria-hidden="true" />
            ) : autoRefreshIndicatorState != null ? (
              <AutoRefreshIndicator state={autoRefreshIndicatorState} />
            ) : (
              <PageTypeIcon type={page.type} size={15} />
            )}
          </span>
        ) : (
          <>
            {tab.pinned ? <Pin className="tab__pin" size={11} aria-hidden="true" /> : null}
            <span className="tab__title">{page.title}</span>
          </>
        )}
        {isArchiveReplayThread && (!compact || tab.pinned) ? (
          <span className="tab__archive-replay-indicator" title="過去実況の再生対象">
            <Play size={13} fill="currentColor" aria-hidden="true" />
          </span>
        ) : null}
        {/* 変更理由: タブが非アクティブでも自動更新設定は残るため、実行中/待機中を区別できる表示を常時出す。
            簡易表示ではアイコンの位置に出すため、ここでは広い表示だけ扱う。 */}
        {autoRefreshIndicatorState != null && !tab.pinned && !compact && (
          <AutoRefreshIndicator state={autoRefreshIndicatorState} />
        )}
        {/* 最後のタブを残す規則はページ種別によらず共通にする。
            変更理由: 広く開いた垂直タブでもボタンを描画し、表示はCSSでホバー時だけに限る。
            簡易表示は細幅を保つため描画しない。 */}
        {!compact && !tab.pinned && canClose && (
          <button
            className="tab__close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            title="タブを閉じる"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {tooltip}
    </>
  );
};

export interface TabBarViewProps {
  /** 表示中のタブを並び順どおりに渡す。 */
  items: TabBarItem[];
  selectedTabId: string;
  isVertical: boolean;
  collapsed: boolean;
  width: number;
  canCloseTab: boolean;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  /** 表示中の並び順 visibleIndex へ移す。移動できなければ false を返す。 */
  onMoveTab: (tabId: string, visibleIndex: number) => boolean;
  /**
   * タブバーの外（窓の外を含む）でドラッグを終えたときに、離した画面上の位置を渡す。
   * 窓をまたぐ移動として処理できたら true を返し、タブバー内の並べ替えは行わない。
   */
  onDragTabOut?: (
    tabId: string,
    screenX: number,
    screenY: number,
    clientPoint: { x: number; y: number },
  ) => boolean;
  onDragTabPreview?: (
    tabId: string,
    screenX: number,
    screenY: number,
    clientPoint: { x: number; y: number },
  ) => void;
  onDragTabPreviewEnd?: () => void;
  /** 選択中タブから delta 個ぶん前後へ切り替える。切り替えられなければ false を返す。 */
  onStepTab: (delta: 1 | -1) => boolean;
  onSetCollapsed: (collapsed: boolean) => void;
  /** 幅を確定する。expand が true なら縮小表示から展開へ移る。 */
  onCommitWidth: (width: number, expand: boolean) => void;
  onTabContextMenu: (tab: Tab, x: number, y: number) => void;
  onBarContextMenu: (x: number, y: number) => void;
  /** メニューなど、タブバーの内側に重ねる要素。 */
  overlay?: React.ReactNode;
  /** 複数ペインの共通タブバーで、このタブ一覧がどのペインのものかを示す見出し。 */
  sectionLabel?: string;
  /** 見出しの横へ添える、ペインがフォーカス中かどうか。 */
  isPaneFocused?: boolean;
  /** 共通タブバーの本体に付ける他ペインのタブ一覧。 */
  extraSections?: React.ReactNode;
  footer?: React.ReactNode;
  /** 共通タブバーの2つ目以降のペイン。外枠・開閉ボタン・幅変更を持たず、タブ一覧だけを描く。 */
  embedded?: boolean;
}

/**
 * タブバー本体の表示と、スクロール・ホイール・ドラッグによる DOM 側の挙動を担当する。
 *
 * ストアには触れず、状態と操作はすべて props で受け取る。
 * そのため、ストアを用意せずに様々なタブ数や表示状態をストーリーで確かめられる。
 */
export const TabBarView: React.FC<TabBarViewProps> = ({
  items,
  selectedTabId,
  isVertical,
  collapsed,
  width,
  canCloseTab,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onMoveTab,
  onDragTabOut,
  onDragTabPreview,
  onDragTabPreviewEnd,
  onStepTab,
  onSetCollapsed,
  onCommitWidth,
  onTabContextMenu,
  onBarContextMenu,
  overlay,
  sectionLabel,
  isPaneFocused = false,
  extraSections,
  footer,
  embedded = false,
}) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);

  const { tabListScrollState, isTabListScrollable, scrollTabIntoView } = useTabListScroll({
    tabListRef,
    selectedTabId,
    items,
  });
  const highlightedTabIds = useNewTabHighlight(items, scrollTabIntoView);
  useTabBarWheelSwitch(barRef, onStepTab);
  const { wasDraggingRef, handleDragStart, handleDragEnd } = useTabDragTracking({
    tabListRef,
    onMoveTab,
    onDragTabOut,
    onDragTabPreview,
    onDragTabPreviewEnd,
  });
  const {
    dragWidth,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    handleResizePointerCancel,
  } = useTabBarWidthResize({ collapsed, width, onCommitWidth });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      e.preventDefault();
      // タブ個別メニューのみ開き、タブバー背景へのバブルアップを止める
      e.stopPropagation();
      onTabContextMenu(tab, e.clientX, e.clientY);
    },
    [onTabContextMenu],
  );

  // タブバーの空白部分を右クリックしたときのメニュー
  const handleBarContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target;
      // 個別メニューは座標付きの仮想Triggerをタブバー内へ挿入するため、
      // そのイベントを背景メニューとして二重に扱わない。
      if (
        target instanceof Element &&
        target.closest(
          ".tab, .tab-bar__add, .tab-bar__bookmark, [data-context-menu-trigger], [data-popup='true']",
        )
      ) {
        return;
      }

      e.preventDefault();
      onBarContextMenu(e.clientX, e.clientY);
    },
    [onBarContextMenu],
  );

  const handleArrowNavigate = useCallback(
    (index: number, delta: number) => {
      if (items.length === 0) return;
      const nextIndex = (index + delta + items.length) % items.length;
      const nextItem = items[nextIndex];
      if (!nextItem) return;
      onSelectTab(nextItem.tab.id);
      // フォーカスも追従させ、連続した矢印キー操作を可能にする。
      tabListRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]")[nextIndex]?.focus();
    },
    [items, onSelectTab],
  );

  const renderAddTabButton = (concealed = false) => (
    <button
      type="button"
      className="tab-bar__add icon-button"
      onClick={onAddTab}
      onContextMenu={(e) => e.stopPropagation()}
      title="新しいタブ"
      aria-label="新しいタブ"
      // 変更理由: フォーカス外のペインでもボタン分の高さを確保し、ペインを切り替えても
      // タブ一覧の長さとスクロール状態が変わらないようにする。見えなくするだけで場所は残す。
      style={concealed ? { visibility: "hidden" } : undefined}
      tabIndex={concealed ? -1 : undefined}
    >
      <Plus size={13} />
    </button>
  );
  const addTabButton = renderAddTabButton();

  const displayWidth = dragWidth ?? width;

  // 変更理由: 共通タブバーでは、ペインごとにタブ一覧を区切って並べるため、
  // 一覧を1つの区画として扱う。単独のときは見出しを出さず、従来の見た目のままにする。
  const paneSection = (
    <div
      className={`tab-bar__pane-section${sectionLabel ? " tab-bar__pane-section--labeled" : ""}${
        isPaneFocused ? " tab-bar__pane-section--focused" : ""
      }`}
      onContextMenu={embedded ? handleBarContextMenu : undefined}
    >
      {sectionLabel ? <div className="tab-bar__pane-label">{sectionLabel}</div> : null}
      <DragDropProvider
        sensors={[WindowPointerSensor, KeyboardSensor]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* 分割時は元タブの幅が変わるため、ドロップ後に旧位置へ戻るアニメーションを行わない。 */}
        {isVertical ? (
          <div hidden>
            <DragOverlay disabled dropAnimation={null}>
              {null}
            </DragOverlay>
          </div>
        ) : null}
        <div
          className={`tab-list-container${
            tabListScrollState.canScrollLeft ? " tab-list-container--can-scroll-left" : ""
          }${tabListScrollState.canScrollRight ? " tab-list-container--can-scroll-right" : ""}${
            tabListScrollState.canScrollTop ? " tab-list-container--can-scroll-top" : ""
          }${tabListScrollState.canScrollBottom ? " tab-list-container--can-scroll-bottom" : ""}`}
        >
          <div
            ref={tabListRef}
            className="tab-list"
            role="tablist"
            aria-orientation={isVertical ? "vertical" : "horizontal"}
          >
            {items.map(
              ({ tab, isActive, autoRefreshIndicatorState, isArchiveReplayThread }, index) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isActive={isActive}
                  isHighlighted={highlightedTabIds.has(tab.id)}
                  autoRefreshIndicatorState={autoRefreshIndicatorState}
                  isArchiveReplayThread={isArchiveReplayThread}
                  canClose={canCloseTab}
                  isVertical={isVertical}
                  compact={isVertical && collapsed}
                  isPaneUnfocused={isActive && Boolean(sectionLabel) && !isPaneFocused}
                  wasDraggingRef={wasDraggingRef}
                  onSelect={onSelectTab}
                  onClose={onCloseTab}
                  onContextMenu={handleContextMenu}
                  onArrowNavigate={handleArrowNavigate}
                />
              ),
            )}
            {/* 変更理由: 水平モードでは従来どおり溢れたときだけ外へ固定する。
                垂直モードでは最終タブの直後に置き、一覧と一緒にスクロールさせる。 */}
            {!isVertical && !isTabListScrollable ? addTabButton : null}
            {/* 共通の縦レーンでは、フォーカス中のペインにだけ追加ボタンを置く。 */}
            {isVertical ? renderAddTabButton(Boolean(sectionLabel) && !isPaneFocused) : null}
          </div>
        </div>
      </DragDropProvider>
      {/* 変更理由: 共通の水平タブバーでは、溢れたときの追加ボタンもペインごとの区画の内側へ固定する。 */}
      {!isVertical && sectionLabel && isTabListScrollable ? addTabButton : null}
    </div>
  );

  if (embedded) {
    return (
      <>
        {paneSection}
        {overlay}
      </>
    );
  }

  return (
    <div
      ref={barRef}
      className={`tab-bar${isVertical ? " tab-bar--vertical" : ""}${
        isVertical && collapsed ? " tab-bar--collapsed" : ""
      }${isVertical && dragWidth != null ? " tab-bar--resizing" : ""}${
        isVertical && sectionLabel ? " tab-bar--multiple-panes" : ""
      }`}
      // 変更理由: 簡易表示では幅をCSSの固定値に任せ、展開表示とドラッグ中だけ操作幅を使う。
      // ドラッグ中のタブがバー幅以上に広がらないよう、実幅をCSS変数でも共有する。
      style={
        isVertical && (!collapsed || dragWidth != null)
          ? ({
              width: displayWidth,
              "--tab-bar-width": `${displayWidth}px`,
            } as React.CSSProperties)
          : undefined
      }
      onContextMenu={handleBarContextMenu}
    >
      {/* 変更理由: 更新ボタンはタイトルバーへ集約し、タブバー上部はタブ操作に使う。 */}
      {isVertical ? (
        <>
          <div className="tab-bar__vertical-header">
            <button
              type="button"
              className="tab-bar__collapse"
              onClick={() => onSetCollapsed(!collapsed)}
              title={collapsed ? "展開表示に戻す" : "簡易表示にする"}
              aria-label={collapsed ? "展開表示に戻す" : "簡易表示にする"}
              aria-expanded={!collapsed}
            >
              {/* 変更理由: タイトルバーのボタンと大きさを揃える。 */}
              {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </div>
        </>
      ) : null}
      {paneSection}
      {extraSections}
      {footer}
      {/* タブが横幅を超えるときだけ、追加ボタンをスクロール領域の外へ固定する。 */}
      {isVertical ? (
        // 変更理由: 縮小時もハンドルを出し、右へ引く操作で展開へ移れるようにする。
        <div
          className="tab-bar__resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="タブバーの幅を変更"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerCancel}
        />
      ) : isTabListScrollable && !sectionLabel ? (
        addTabButton
      ) : null}

      {overlay}
    </div>
  );
};
