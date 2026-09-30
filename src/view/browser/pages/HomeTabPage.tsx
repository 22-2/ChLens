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
  lastVisited: number;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function domainOf(boardUrl: string): string {
  try {
    return new URL(boardUrl).hostname;
  } catch {
    return "";
  }
}
function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

type BoardGroupKey = "today" | "yesterday" | "older";

function groupKeyOf(lastVisited: number, todayStart: number): BoardGroupKey {
  if (lastVisited >= todayStart) {
    return "today";
  }
  if (lastVisited >= todayStart - 24 * 60 * 60 * 1000) {
    return "yesterday";
  }
  return "older";
}

const GROUP_LABELS: Record<BoardGroupKey, string> = {
  today: "今日",
  yesterday: "昨日",
  older: "それ以前",
};

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
            if (date > existing.lastVisited) {
              existing.lastVisited = date;
            }
          } else {
            grouped.set(boardUrl, { boardUrl, boardTitle, lastVisited: date });
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

  // 変更理由: 日付は項目ごとではなく、画像のセッション一覧のように日別セクションで分ける。
  const grouped = React.useMemo(() => {
    const todayStart = startOfDay(Date.now());
    const groups: Record<BoardGroupKey, RecentBoard[]> = {
      today: [],
      yesterday: [],
      older: [],
    };
    for (const board of boards) {
      groups[groupKeyOf(board.lastVisited, todayStart)].push(board);
    }
    return (Object.keys(groups) as BoardGroupKey[])
      .filter((key) => groups[key].length > 0)
      .map((key) => ({ key, label: GROUP_LABELS[key], items: groups[key] }));
  }, [boards]);

  const openBoard = React.useCallback(
    (board: RecentBoard, background = false) => {
      // 変更理由: ホームタブの履歴をNAVIGATEで上書きしないよう、新規タブへ逃がす。
      dispatch(
        tabActions.openInNewTab(
          {
            type: "threadList",
            title: board.boardTitle,
            boardUrl: board.boardUrl,
            boardTitle: board.boardTitle,
          },
          { background },
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
      {boards.length === 0 ? (
        <div className="home-tab-page__empty">最近開いた板はまだありません。</div>
      ) : (
        grouped.map((group) => (
          <React.Fragment key={group.key}>
            <div className="home-tab-page__heading">{group.label}</div>
            <div className="home-tab-page__list">
              {group.items.map((board) => (
                <Button
                  key={board.boardUrl}
                  className="home-tab-page__link home-tab-page__link--board"
                  variant="subtle"
                  onClick={() => openBoard(board)}
                  onAuxClick={(event) => {
                    if (event.button !== 1) return;
                    // 変更理由: 常設ホームは通常クリックでも新規タブを開くため、
                    // 中クリックも同じ板を新規タブへ送り、ブラウザー既定動作との二重処理を防ぐ。
                    event.preventDefault();
                    event.stopPropagation();
                    openBoard(board, true);
                  }}
                  title={`${board.boardTitle}\n${board.boardUrl}`}
                >
                  <span className="home-tab-page__link-title">{board.boardTitle}</span>
                  {domainOf(board.boardUrl) ? (
                    <span className="home-tab-page__link-domain">{domainOf(board.boardUrl)}</span>
                  ) : null}
                </Button>
              ))}
            </div>
          </React.Fragment>
        ))
      )}
    </div>
  );
};
