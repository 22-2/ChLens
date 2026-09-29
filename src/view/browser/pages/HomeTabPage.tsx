import React from "react";
import { getAll as getAllHistory } from "src/core/History";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { Alert } from "src/view/browser/ui/Alert";
import { Button } from "src/view/browser/ui/Button";
import { Spinner } from "src/view/browser/ui/Spinner";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

interface RecentBoard {
  boardUrl: string;
  boardTitle: string;
  threadCount: number;
  lastVisited: number;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function formatLastVisited(timestamp: number): string {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// 常設ホームタブ専用ビュー。板ツリー（BoardTreePage）とは別物で、最近開いた板だけを並べる。
// 変更理由: ホームタブ自体は遷移不可のため、板の選択はすべて新規タブで開く。
export const HomeTabPage: React.FC = () => {
  const { dispatch } = useTabStore();
  const [boards, setBoards] = React.useState<RecentBoard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const records = await getAllHistory();
        // 変更理由: 閲覧履歴はスレ単位でしか残らないため、スレURLから板URLを導出して板単位へ集約する。
        const grouped = new Map<string, RecentBoard>();
        for (const record of Array.isArray(records) ? records : []) {
          const threadUrl = normalizeString(record.url);
          if (!threadUrl) {
            continue;
          }
          const boardUrl = getBoardUrlFromThreadUrl(threadUrl);
          if (!boardUrl || boardUrl === threadUrl) {
            continue;
          }
          const date = typeof record.date === "number" ? record.date : 0;
          const boardTitle = normalizeString(record.boardTitle, boardUrl);
          const existing = grouped.get(boardUrl);
          if (existing) {
            existing.threadCount += 1;
            if (date > existing.lastVisited) {
              existing.lastVisited = date;
            }
          } else {
            grouped.set(boardUrl, { boardUrl, boardTitle, threadCount: 1, lastVisited: date });
          }
        }
        if (!cancelled) {
          setBoards(
            [...grouped.values()].sort((a, b) => b.lastVisited - a.lastVisited).slice(0, 100),
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "最近開いた板の読み込みに失敗しました");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openBoard = React.useCallback(
    (board: RecentBoard) => {
      // 変更理由: ホームタブの履歴をNAVIGATEで上書きしないよう、新規タブへ逃がす。
      dispatch(
        tabActions.openInNewTab(
          {
            type: "threadList",
            title: board.boardTitle,
            boardUrl: board.boardUrl,
            boardTitle: board.boardTitle,
          },
          { background: false },
        ),
      );
    },
    [dispatch],
  );

  if (loading) {
    return (
      <div className="home-tab-page">
        <div className="home-tab-page__status">
          <Spinner size="xs" />
          <span>最近開いた板を読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-tab-page">
        <Alert className="home-tab-page__alert" color="red" title="読み込みエラー">
          {error}
        </Alert>
      </div>
    );
  }

  return (
    <div className="home-tab-page">
      <div className="home-tab-page__heading">最近開いた板</div>
      {boards.length === 0 ? (
        <div className="home-tab-page__empty">最近開いた板はまだありません。</div>
      ) : (
        <div className="home-tab-page__list">
          {boards.map((board) => {
            const sub = `${board.threadCount}スレ${
              board.lastVisited ? ` • 最終閲覧 ${formatLastVisited(board.lastVisited)}` : ""
            }`;
            const tooltip = `${board.boardTitle}\n${board.boardUrl}\n${sub}`;
            return (
              <Button
                key={board.boardUrl}
                className="home-tab-page__link home-tab-page__link--board"
                variant="subtle"
                onClick={() => openBoard(board)}
                title={tooltip}
              >
                <span className="home-tab-page__link-title">{board.boardTitle}</span>
                <span className="home-tab-page__link-sub">{sub}</span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
};
