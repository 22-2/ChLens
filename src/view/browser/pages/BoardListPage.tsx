import React, { useCallback, useEffect, useState } from "react";
import { BBSMenu } from "src/core/BBSMenuParser";
import { container } from "src/service-container/index";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

export const BoardListPage: React.FC = () => {
  const { dispatch } = useTabStore();
  const [categories, setCategories] = useState<BBSMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});

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
      {categories.map((menu, i) => (
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
                        onClick={() => handleBoardClick(board.url, board.name)}
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
    </div>
  );
};
