import { BookOpen, Image, Info, ListTree, Pencil, Search } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { SidePanelBoards } from "src/features/board/ui/SidePanelBoards";
import { SidePanelFavorites } from "src/features/bookmark/ui/SidePanelFavorites";
import { SidePanelImages } from "src/features/media/ui/SidePanelImages";
import { SidePanelExtract } from "src/features/thread/ui/SidePanelExtract";
import { SidePanelProperties } from "src/features/thread/ui/SidePanelProperties";
import { SidePanelWrite } from "src/features/write/ui/SidePanelWrite";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
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

export function SidePanel() {
  const { state: saved, dispatch } = useSidePanelState();
  const { viewTab, viewPage } = useTabStore();
  const state = normalizeSidePanel(saved);
  const dragged = useRef<string | null>(null);
  const update = (patch: Partial<typeof state>) =>
    dispatch({ type: TAB_ACTION_TYPES.UPDATE_SIDE_PANEL, sidePanel: { ...state, ...patch } });
  const move = (id: string, target: number) => {
    const items = [...state.views];
    const from = items.indexOf(id);
    if (from < 0 || target < 0 || target >= items.length || from === target) return;
    items.splice(from, 1);
    items.splice(target, 0, id);
    update({ views: items });
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
  const activeView = isViewId(state.activeView) ? views[state.activeView] : null;
  return (
    <aside className="side-panel" style={{ width: resize.size }} aria-label="サイドパネル">
      <div className="side-panel__resize" aria-label="サイドパネルの幅" {...resize.handleProps} />
      <div className="side-panel__tabs" role="tablist" aria-label="サイドパネルのビュー">
        {state.views.map((id, index) => {
          if (!isViewId(id)) return null;
          const view = views[id];
          const Icon = view.Icon;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={state.activeView === id}
              title={`${view.label}（Alt と左右キーで並べ替え）`}
              aria-label={view.label}
              draggable
              onDragStart={() => {
                dragged.current = id;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged.current) move(dragged.current, index);
                dragged.current = null;
              }}
              onDragEnd={() => {
                dragged.current = null;
              }}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                  e.preventDefault();
                  move(id, index + (e.key === "ArrowLeft" ? -1 : 1));
                }
              }}
              onClick={() => update({ activeView: id })}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
      {activeView && (
        <>
          <div className="side-panel__heading">{activeView.label}</div>
          {renderView(activeView, viewTab.id, viewPage)}
        </>
      )}
    </aside>
  );
}
