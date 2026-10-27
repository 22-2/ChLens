import { useBoardListDisplay } from "src/features/board/browser/use-board-list-display";
import { useBoardListLogic } from "src/features/board/browser/use-board-list-logic";
import { buildCategoryId } from "src/features/board/domain/board-list-utils";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

/** 通常の板一覧と取得・削除・検索の規則を共有し、狭い領域ではツリーで表示する。 */
export function SidePanelBoards({ tabId }: { tabId: string }) {
  const { dispatch } = useTabStore();
  const logic = useBoardListLogic(0, tabId);
  const display = useBoardListDisplay({ ...logic, tabId });
  const openBoard = (url: string, title: string, background: boolean) => {
    const page = { type: "threadList" as const, title, boardUrl: url, boardTitle: title };
    dispatch(
      background ? tabActions.openInNewTab(page, { background: true }) : tabActions.navigate(page),
    );
  };
  const toggle = (id: string, value: boolean) =>
    logic.updateOpenStates((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  return (
    <div className="side-panel__content">
      <input
        className="side-panel__search"
        type="search"
        aria-label="板名を検索"
        placeholder="板名を検索"
        value={display.searchQuery}
        onChange={(e) => display.setSearchQuery(e.currentTarget.value)}
      />
      {logic.loading ? (
        <p>板一覧を読み込み中…</p>
      ) : logic.error ? (
        <div>
          <p>{logic.error}</p>
          <button type="button" onClick={() => void logic.fetchMenu(true)}>
            再試行
          </button>
        </div>
      ) : display.displayMenus.length === 0 ? (
        <p>板が見つかりません。</p>
      ) : (
        display.displayMenus.map((menu) => (
          <details
            key={menu.name}
            open={logic.openStates[menu.name] ?? false}
            onToggle={(e) => toggle(menu.name, e.currentTarget.open)}
          >
            <summary>{menu.name}</summary>
            {menu.categories.map((category) => {
              const id = buildCategoryId(menu.name, category.name);
              return (
                <details
                  className="side-panel__category"
                  key={id}
                  open={logic.openStates[id] ?? false}
                  onToggle={(e) => {
                    e.stopPropagation();
                    toggle(id, e.currentTarget.open);
                  }}
                >
                  <summary>{category.name}</summary>
                  {category.boards.map((board) => (
                    <button
                      className="side-panel__entry"
                      key={board.url}
                      type="button"
                      onClick={() => openBoard(board.url, board.name, false)}
                      onAuxClick={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          openBoard(board.url, board.name, true);
                        }
                      }}
                    >
                      {board.name}
                    </button>
                  ))}
                </details>
              );
            })}
          </details>
        ))
      )}
    </div>
  );
}
