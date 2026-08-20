import React from "react";
import { container } from "src/service-container/index";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { Spinner } from "src/view/browser/ui/Spinner";
import { Alert } from "src/view/browser/ui/Alert";
import { Button } from "src/view/browser/ui/Button";
import {
  getLegacyBookmarkService,
  waitForLegacyBookmarkReady,
} from "src/view/browser/utils/legacy-app";

interface FavoriteBoard {
  url: string;
  title: string;
}

interface RawBoardBookmark {
  url?: unknown;
  title?: unknown;
  boardTitle?: unknown;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function readFavoriteBoards(): Promise<FavoriteBoard[]> {
  await waitForLegacyBookmarkReady();

  const bookmarkService = getLegacyBookmarkService();
  const rawBoards = bookmarkService?.getAllBoards?.();
  if (!Array.isArray(rawBoards)) {
    return [];
  }

  const seenUrls = new Set<string>();
  const favorites: FavoriteBoard[] = [];

  for (const rawEntry of rawBoards) {
    const entry = rawEntry as RawBoardBookmark;
    const url = normalizeString(entry.url);
    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    favorites.push({
      url,
      title: normalizeString(entry.boardTitle, normalizeString(entry.title, url)),
    });
  }

  return favorites;
}

export const HomePage: React.FC = () => {
  const { dispatch } = useTabStore();
  const [favoriteBoards, setFavoriteBoards] = React.useState<FavoriteBoard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadFavoriteBoards = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFavoriteBoards(await readFavoriteBoards());
    } catch (e) {
      setError(e instanceof Error ? e.message : "お気に入り板の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadFavoriteBoards();

    const handleBookmarkUpdated = () => {
      void loadFavoriteBoards();
    };

    container.message.on("bookmark_updated", handleBookmarkUpdated);
    return () => {
      container.message.off("bookmark_updated", handleBookmarkUpdated);
    };
  }, [loadFavoriteBoards]);

  const openBoardList = React.useCallback(() => {
    dispatch({
      type: "NAVIGATE",
      page: { type: "boardList", title: "板一覧" },
    });
  }, [dispatch]);

  // const openHistory = React.useCallback(() => {
  //   dispatch({
  //     type: "NAVIGATE",
  //     page: { type: "historyList", title: "閲覧履歴" },
  //   });
  // }, [dispatch]);

  const openBoard = React.useCallback(
    (board: FavoriteBoard) => {
      dispatch({
        type: "NAVIGATE",
        page: {
          type: "threadList",
          title: board.title,
          boardUrl: board.url,
          boardTitle: board.title,
        },
      });
    },
    [dispatch],
  );

  // const openBookmarks = React.useCallback(() => {
  //   dispatch({
  //     type: "NAVIGATE",
  //     page: { type: "bookmarkList", title: "ブックマーク" },
  //   });
  // }, [dispatch]);

  return (
    <div className="home-page">
      <Button
        className="home-page__link home-page__link--action"
        variant="subtle"
        onClick={openBoardList}
      >
        板一覧を開く
      </Button>
      {/* <Button
        className="home-page__link home-page__link--action"
        variant="subtle"
        onClick={openHistory}
      >
        閲覧履歴を開く
      </Button>
      <Button
        className="home-page__link home-page__link--action"
        variant="subtle"
        onClick={openBookmarks}
      >
        ブックマークを開く
      </Button> */}
      <div className="home-page__heading">お気に入り板</div>

      {loading ? (
        <div className="home-page__status">
          <Spinner size="xs" />
          <span>お気に入り板を読み込み中...</span>
        </div>
      ) : error ? (
        <Alert className="home-page__alert" color="red" title="読み込みエラー">
          {error}
        </Alert>
      ) : (
        <div className="home-page__list">
          {favoriteBoards.length === 0 ? (
            <div className="home-page__empty">お気に入り板はまだありません。</div>
          ) : (
            favoriteBoards.map((board) => (
              <Button
                key={board.url}
                className="home-page__link"
                variant="subtle"
                onClick={() => openBoard(board)}
              >
                {board.title}
              </Button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
