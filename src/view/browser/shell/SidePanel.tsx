import { BookOpen, Image, Info, ListTree, Pencil, Search } from "lucide-react";
import { useRef } from "react";
import { SidePanelBoards } from "src/view/browser/shell/SidePanelBoards";
import { SidePanelExtract } from "src/view/browser/shell/SidePanelExtract";
import { SidePanelFavorites } from "src/view/browser/shell/SidePanelFavorites";
import { SidePanelImages } from "src/view/browser/shell/SidePanelImages";
import { SidePanelProperties } from "src/view/browser/shell/SidePanelProperties";
import { SidePanelWrite } from "src/view/browser/shell/SidePanelWrite";
import { normalizeSidePanel } from "src/view/browser/state/tabs/side-panel-state";
import { TAB_ACTION_TYPES } from "src/view/browser/state/tabs/tab-store-types";
import { useSidePanelState, useTabStore } from "src/view/browser/state/tabs/use-tab-store";

const views = {
  boards: { label: "板一覧", Icon: ListTree },
  favorites: { label: "お気に入り", Icon: BookOpen },
  images: { label: "画像一覧", Icon: Image },
  extract: { label: "抽出レス", Icon: Search },
  properties: { label: "スレプロパティ", Icon: Info },
  write: { label: "書き込み", Icon: Pencil },
} as const;
type ViewId = keyof typeof views;

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
  if (!state.isOpen) return null;
  return (
    <aside className="side-panel" style={{ width: state.width }} aria-label="サイドパネル">
      <div
        className="side-panel__resize"
        role="separator"
        aria-label="サイドパネルの幅"
        aria-orientation="vertical"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            update({
              width: Math.max(
                200,
                Math.min(600, state.width + (event.key === "ArrowLeft" ? 20 : -20)),
              ),
            });
          }
        }}
        onPointerDown={(event) => {
          const start = event.clientX;
          const width = state.width;
          const target = event.currentTarget;
          target.setPointerCapture(event.pointerId);
          target.onpointermove = (moveEvent) => {
            target.parentElement?.style.setProperty(
              "width",
              `${Math.max(200, Math.min(600, width + start - moveEvent.clientX))}px`,
            );
          };
          const cleanup = () => {
            target.onpointermove = null;
            target.onpointerup = null;
            target.onpointercancel = null;
          };
          target.onpointerup = (endEvent) => {
            cleanup();
            update({ width: Math.max(200, Math.min(600, width + start - endEvent.clientX)) });
          };
          target.onpointercancel = () => {
            cleanup();
            target.parentElement?.style.setProperty("width", `${width}px`);
          };
        }}
      />
      <div className="side-panel__tabs" role="tablist" aria-label="サイドパネルのビュー">
        {state.views.map((id, index) => {
          const view = views[id as ViewId];
          if (!view) return null;
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
      <div className="side-panel__heading">{views[state.activeView as ViewId]?.label}</div>
      {state.activeView === "boards" ? (
        <SidePanelBoards key={viewTab.id} tabId={viewTab.id} />
      ) : state.activeView === "favorites" ? (
        <SidePanelFavorites />
      ) : state.activeView === "extract" ? (
        viewPage.type === "thread" ? (
          <SidePanelExtract
            key={`${viewTab.id}:${viewPage.threadUrl}`}
            tabId={viewTab.id}
            page={viewPage}
          />
        ) : (
          <p className="side-panel__empty">スレッドを開くと表示されます。</p>
        )
      ) : state.activeView === "images" ? (
        viewPage.type === "thread" ? (
          <SidePanelImages tabId={viewTab.id} page={viewPage} />
        ) : (
          <p className="side-panel__empty">スレッドを開くと表示されます。</p>
        )
      ) : state.activeView === "properties" ? (
        viewPage.type === "thread" ? (
          <SidePanelProperties tabId={viewTab.id} page={viewPage} />
        ) : (
          <p className="side-panel__empty">スレッドを開くと表示されます。</p>
        )
      ) : state.activeView === "write" ? (
        <SidePanelWrite />
      ) : null}
    </aside>
  );
}
