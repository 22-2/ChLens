import React, { useEffect, useState, useCallback } from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { container } from "../../../service-container/index";
import type { IBBSMenuCategory } from "../../../service-container/interfaces";

export const BoardListPage: React.FC = () => {
  const { dispatch } = useTabStore();
  const [categories, setCategories] = useState<IBBSMenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    [dispatch]
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
      {categories.map((category, i) => (
        <details key={i} className="board-category" open>
          <summary className="board-category__title">
            {category.title}
          </summary>
          <ul className="board-category__list">
            {category.board.map((board, j) => (
              <li
                key={j}
                className="board-item"
                onClick={() => handleBoardClick(board.url, board.title)}
              >
                {board.title}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
};
