import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BBSMenu } from "src/core/BBSMenuParser";
import { container } from "src/service-container/index";
import {
  ContextMenu,
  type ContextMenuItem,
} from "src/view/browser/components/ContextMenu";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

const BOARD_LIST_REMOVED_URLS_KEY = "board_list_removed_urls";

interface BoardContextMenuState {
  x: number;
  y: number;
  boardName: string;
  boardUrl: string;
}

function normalizeBoardUrlForRemove(url: string): string {
  try {
    return new window.URL(url).href;
  } catch {
    return url;
  }
}

export const BoardListPage: React.FC = () => {
  const { dispatch } = useTabStore();
  const [categories, setCategories] = useState<BBSMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});
  const [removedBoardUrls, setRemovedBoardUrls] = useState<Set<string>>(
    new Set(),
  );
  const [contextMenuState, setContextMenuState] =
    useState<BoardContextMenuState | null>(null);

  useEffect(() => {
    const saved = container.config.get("board_list_open_states");
    if (saved) {
      try {
        setOpenStates(JSON.parse(saved));
      } catch (e) {
        // ignore parse error
      }
    }
  }, []);

  useEffect(() => {
    const saved = container.config.get(BOARD_LIST_REMOVED_URLS_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as string[];
      if (!Array.isArray(parsed)) {
        return;
      }

      setRemovedBoardUrls(
        new Set(parsed.map((url) => normalizeBoardUrlForRemove(url))),
      );
    } catch {
      // 破損データは無視して通常表示を優先する。
    }
  }, []);

  const handleToggle = useCallback((id: string, isOpen: boolean) => {
    setOpenStates((prev) => {
      const next = { ...prev, [id]: isOpen };
      container.config.set("board_list_open_states", JSON.stringify(next));
      return next;
    });
  }, []);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // container経由でBBSMenuサービスにアクセス
      const result = await container.bbsMenu.get(false);
      if (result.status === "success" && result.menu) {
        setCategories(result.menu);
      } else {
        setError(result.message ?? "板一覧の取得に失敗しました");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  const handleBoardClick = useCallback(
    (boardUrl: string, boardTitle: string) => {
      dispatch({
        type: "NAVIGATE",
        page: {
          type: "threadList",
          title: boardTitle,
          boardUrl,
          boardTitle,
        },
      });
    },
    [dispatch],
  );

  const persistRemovedBoardUrls = useCallback((nextSet: Set<string>) => {
    void container.config.set(
      BOARD_LIST_REMOVED_URLS_KEY,
      JSON.stringify(Array.from(nextSet)),
    );
  }, []);

  const handleRemoveBoard = useCallback(
    (url: string) => {
      const normalizedUrl = normalizeBoardUrlForRemove(url);
      setRemovedBoardUrls((prev) => {
        if (prev.has(normalizedUrl)) {
          return prev;
        }

        const next = new Set(prev);
        next.add(normalizedUrl);
        persistRemovedBoardUrls(next);
        return next;
      });
      container.toast.info("板一覧から削除しました");
    },
    [persistRemovedBoardUrls],
  );

  const displayMenus = useMemo(() => {
    return categories
      .map((menu) => {
        const nextCategories = menu.categories
          .map((category) => ({
            ...category,
            boards: category.boards.filter(
              (board) =>
                !removedBoardUrls.has(normalizeBoardUrlForRemove(board.url)),
            ),
          }))
          .filter((category) => category.boards.length > 0);
        return {
          ...menu,
          categories: nextCategories,
        };
      })
      .filter((menu) => menu.categories.length > 0);
  }, [categories, removedBoardUrls]);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenuState) {
      return [];
    }

    return [
      {
        id: "remove-board",
        label: `この板を一覧から削除 (${contextMenuState.boardName})`,
        danger: true,
        onSelect: () => handleRemoveBoard(contextMenuState.boardUrl),
      },
    ];
  }, [contextMenuState, handleRemoveBoard]);

  if (loading) {
    return <div className="page-status">読み込み中...</div>;
  }

  if (error) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={fetchMenu}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="board-list-page">
      {displayMenus.map((menu, i) => (
        <details
          key={i}
          className="board-menu"
          open={openStates[menu.name] ?? false}
          onToggle={(e) => {
            if (e.target === e.currentTarget) {
              handleToggle(menu.name, (e.target as HTMLDetailsElement).open);
            }
          }}
        >
          <summary className="board-menu__title">{menu.name}</summary>
          <div className="board-menu__content">
            {menu.categories.map((category, j) => {
              const categoryId = `${menu.name}:${category.name}`;
              return (
                <details
                  key={j}
                  className="board-category"
                  open={openStates[categoryId] ?? false}
                  onToggle={(e) => {
                    if (e.target === e.currentTarget) {
                      handleToggle(
                        categoryId,
                        (e.target as HTMLDetailsElement).open,
                      );
                    }
                  }}
                >
                  <summary className="board-category__title">
                    {category.name}
                  </summary>
                  <ul className="board-category__list">
                    {category.boards.map((board, k) => (
                      <li
                        key={k}
                        className="board-item"
                        onMouseDown={(e) => {
                          if (e.button === 0) {
                            handleBoardClick(board.url, board.name);
                          } else if (e.button === 1) {
                            // 中クリックで新しいタブで開く
                            dispatch({
                              type: "OPEN_IN_NEW_TAB",
                              page: {
                                type: "threadList",
                                title: board.name,
                                boardUrl: board.url,
                                boardTitle: board.name,
                              },
                            });
                          }
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setContextMenuState({
                            x: event.clientX,
                            y: event.clientY,
                            boardName: board.name,
                            boardUrl: board.url,
                          });
                        }}
                      >
                        {board.name}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </details>
      ))}

      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuItems}
          onClose={() => setContextMenuState(null)}
        />
      )}
    </div>
  );
};
