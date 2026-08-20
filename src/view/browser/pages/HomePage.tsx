import { Box, Text, UnstyledButton } from "@mantine/core";
import React from "react";
import { container } from "src/service-container/index";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { Spinner } from "src/view/browser/ui/Spinner";
import { Alert } from "src/view/browser/ui/Alert";
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
    <Box className="home-page">
      <UnstyledButton className="home-page__link home-page__link--action" onClick={openBoardList}>
        <Text size="sm">板一覧を開く</Text>
      </UnstyledButton>
      {/* <UnstyledButton
        className="home-page__link home-page__link--action"
        onClick={openHistory}
      >
        <Text size="sm">閲覧履歴を開く</Text>
      </UnstyledButton>
      <UnstyledButton
        className="home-page__link home-page__link--action"
        onClick={openBookmarks}
      >
        <Text size="sm">ブックマークを開く</Text>
      </UnstyledButton> */}
      <Text className="home-page__heading">お気に入り板</Text>

      {loading ? (
        <Box className="home-page__status">
          <Spinner size="xs" />
          <Text size="sm" c="dimmed">
            お気に入り板を読み込み中...
          </Text>
        </Box>
      ) : error ? (
        <Alert className="home-page__alert" color="red" title="読み込みエラー">
          {error}
        </Alert>
      ) : (
        <Box className="home-page__list">
          {favoriteBoards.length === 0 ? (
            <Text className="home-page__empty">お気に入り板はまだありません。</Text>
          ) : (
            favoriteBoards.map((board) => (
              <UnstyledButton
                key={board.url}
                className="home-page__link"
                onClick={() => openBoard(board)}
              >
                <Text size="sm">{board.title}</Text>
              </UnstyledButton>
            ))
          )}
        </Box>
      )}
    </Box>
  );
};
