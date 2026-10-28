import { DragDropProvider } from "@dnd-kit/react";
import { BookOpen, Check, Image, Info, ListTree, Pencil, Search } from "lucide-react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { SidePanelBoards } from "src/features/board/ui/SidePanelBoards";
import { SidePanelFavorites } from "src/features/bookmark/ui/SidePanelFavorites";
import { SidePanelImages } from "src/features/media/ui/SidePanelImages";
import { SidePanelExtract } from "src/features/thread/ui/SidePanelExtract";
import { SidePanelProperties } from "src/features/thread/ui/SidePanelProperties";
import { SidePanelWrite } from "src/features/write/ui/SidePanelWrite";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
import { readSortableMove, useSortableTab } from "src/view/browser/components/sortable-tab";
import { useResizeHandle } from "src/view/browser/hooks/use-resize-handle";
import {
  normalizeSidePanel,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  SIDE_PANEL_VIEWS,
} from "src/view/browser/state/tabs/side-panel-state";
import { TAB_ACTION_TYPES } from "src/view/browser/state/tabs/tab-store-types";
import { useSidePanelState, useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { Page, ThreadPage } from "src/view/browser/types";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";

type ViewId = (typeof SIDE_PANEL_VIEWS)[number];
type ViewDefinition = { label: string; Icon: typeof ListTree } & (
  | { requiresThread: false; render: (tabId: string) => ReactNode }
  /** スレを開いているときだけ表示できるビュー。スレ以外ではその旨を出す。 */
  | { requiresThread: true; render: (tabId: string, page: ThreadPage) => ReactNode }
);

const views: Record<ViewId, ViewDefinition> = {
  boards: {
    label: "板一覧",
    Icon: ListTree,
    requiresThread: false,
    render: (tabId) => <SidePanelBoards key={tabId} tabId={tabId} />,
  },
  favorites: {
    label: "お気に入り",
    Icon: BookOpen,
    requiresThread: false,
    render: () => <SidePanelFavorites />,
  },
  images: {
    label: "画像一覧",
    Icon: Image,
    requiresThread: true,
    render: (tabId, page) => <SidePanelImages tabId={tabId} page={page} />,
  },
  extract: {
    label: "抽出レス",
    Icon: Search,
    requiresThread: true,
    // 検索語はタブとスレごとに持つため、対象が変わったら入力欄ごと作り直す。
    render: (tabId, page) => (
      <SidePanelExtract key={`${tabId}:${page.threadUrl}`} tabId={tabId} page={page} />
    ),
  },
  properties: {
    label: "スレプロパティ",
    Icon: Info,
    requiresThread: true,
    render: (tabId, page) => <SidePanelProperties tabId={tabId} page={page} />,
  },
  write: {
    label: "書き込み",
    Icon: Pencil,
    requiresThread: false,
    render: () => <SidePanelWrite />,
  },
};

function isViewId(id: string): id is ViewId {
  return Object.hasOwn(views, id);
}

function renderView(view: ViewDefinition, tabId: string, page: Page): ReactNode {
  if (!view.requiresThread) return view.render(tabId);
  if (page.type !== "thread") {
    return <SidePanelMessage>スレッドを開くと表示されます。</SidePanelMessage>;
  }
  return view.render(tabId, page);
}

interface SortableViewTabProps {
  id: string;
  index: number;
  label: string;
  Icon: typeof ListTree;
  isActive: boolean;
  wasDraggingRef: RefObject<boolean>;
  onSelect: () => void;
  onMove: (target: number) => void;
}

// メインのタブバーと同じ useSortable の設定・クラス名でドラッグ並べ替えを行う。
function SortableViewTab({
  id,
  index,
  label,
  Icon,
  isActive,
  wasDraggingRef,
  onSelect,
  onMove,
}: SortableViewTabProps) {
  const { ref, isDragSource } = useSortableTab({ id, index, group: "side-panel" });
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      className={`side-panel__tab${isDragSource ? " side-panel__tab--dragging" : ""}`}
      aria-selected={isActive}
      title={`${label}（Alt と左右キーで並べ替え）`}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          onMove(index + (e.key === "ArrowLeft" ? -1 : 1));
        }
      }}
      onClick={() => {
        if (wasDraggingRef.current) {
          wasDraggingRef.current = false;
          return;
        }
        onSelect();
      }}
    >
      <Icon size={16} />
    </button>
  );
}

export function SidePanel() {
  const { state: saved, dispatch } = useSidePanelState();
  const { viewTab, viewPage } = useTabStore();
  const state = normalizeSidePanel(saved);
  // ドラッグ終了直後の click によるビュー切り替えを1回だけ抑止する（タブバーと同じ挙動）。
  const wasDragging = useRef(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const hiddenViews = state.hiddenViews ?? [];
  const visibleViews = state.views.filter((id) => !hiddenViews.includes(id));
  const update = (patch: Partial<typeof state>) =>
    dispatch({ type: TAB_ACTION_TYPES.UPDATE_SIDE_PANEL, sidePanel: { ...state, ...patch } });
  const move = (id: string, target: number) => {
    const from = visibleViews.indexOf(id);
    if (from < 0 || target < 0 || target >= visibleViews.length || from === target) return false;
    const items = [...state.views];
    const targetId = visibleViews[target]!;
    items.splice(items.indexOf(id), 1);
    items.splice(items.indexOf(targetId) + (target > from ? 1 : 0), 0, id);
    update({ views: items });
    return true;
  };
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = (event: any) => {
    const sorted = readSortableMove(event);
    if (!sorted) return;
    if (move(sorted.id, sorted.toIndex)) wasDragging.current = true;
  };
  const resize = useResizeHandle({
    value: state.width,
    min: SIDE_PANEL_MIN_WIDTH,
    max: SIDE_PANEL_MAX_WIDTH,
    axis: "x",
    // 右端に置くため、左へ引くほど広がる。
    direction: -1,
    keyboardStep: 20,
    onCommit: (width) => update({ width }),
  });
  if (!state.isOpen) return null;
  const activeView =
    visibleViews.includes(state.activeView) && isViewId(state.activeView)
      ? views[state.activeView]
      : null;
  const toggleView = (id: string) => {
    const nextHidden = hiddenViews.includes(id)
      ? hiddenViews.filter((item) => item !== id)
      : [...hiddenViews, id];
    const nextVisible = state.views.filter((item) => !nextHidden.includes(item));
    update({
      hiddenViews: nextHidden,
      activeView: nextVisible.includes(state.activeView)
        ? state.activeView
        : (nextVisible[0] ?? state.activeView),
    });
  };
  return (
    <aside className="side-panel" style={{ width: resize.size }} aria-label="サイドパネル">
      <div className="side-panel__resize" aria-label="サイドパネルの幅" {...resize.handleProps} />
      <div
        className="side-panel__tabs"
        role="tablist"
        aria-label="サイドパネルのビュー"
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuPosition({ x: event.clientX, y: event.clientY });
        }}
      >
        <DragDropProvider onDragEnd={handleDragEnd}>
          {visibleViews.map((id, index) => {
            if (!isViewId(id)) return null;
            const view = views[id];
            return (
              <SortableViewTab
                key={id}
                id={id}
                index={index}
                label={view.label}
                Icon={view.Icon}
                isActive={state.activeView === id}
                wasDraggingRef={wasDragging}
                onSelect={() => update({ activeView: id })}
                onMove={(target) => move(id, target)}
              />
            );
          })}
        </DragDropProvider>
      </div>
      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuPosition(null)}
          enableKeyboardNavigation
          items={state.views.filter(isViewId).map((id) => ({
            id,
            label: views[id].label,
            checked: !hiddenViews.includes(id),
            icon: !hiddenViews.includes(id) ? <Check size={16} /> : <span />,
            onSelect: () => toggleView(id),
          }))}
        />
      )}
      {activeView && (
        <>
          <div
            className={`side-panel__body${state.activeView === "extract" ? " side-panel__body--extract" : ""}`}
          >
            <div className="side-panel__heading">{activeView.label}</div>
            {renderView(activeView, viewTab.id, viewPage)}
          </div>
        </>
      )}
    </aside>
  );
}
