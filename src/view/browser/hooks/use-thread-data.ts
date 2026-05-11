import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { container } from "src/service-container/index";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";
import { useTabDispatch } from "src/view/browser/hooks/use-tab-store";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { buildIndexes } from "src/view/browser/utils/thread-index";
import type { ThreadFilter } from "src/view/browser/utils/types";
import {
  hasExternalLink,
  hasImage,
  hasVideo,
  stripHtml,
} from "src/view/browser/utils/utils";

interface ThreadData {
  responses: IRes[];
  loading: boolean;
  error: string | null;
  expired: boolean;
  indexes: ReturnType<typeof buildIndexes>;
  filteredResponses: IRes[];
  filter: ThreadFilter;
  setFilter: Dispatch<SetStateAction<ThreadFilter>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  showSearch: boolean;
  setShowSearch: Dispatch<SetStateAction<boolean>>;
  fetchThread: () => Promise<void>;
  idPositions: Map<number, number>;
  setResponses: Dispatch<SetStateAction<IRes[]>>;
  messageProtocol: string;
}

export function useThreadData(
  tabId: string,
  page: ThreadPageType,
  refreshKey: number,
): ThreadData {
  const dispatch = useTabDispatch();
  const [responses, setResponses] = useState<IRes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const titleUpdatedRef = useRef(false);

  const messageProtocol = useMemo(() => {
    try {
      return new window.URL(page.threadUrl).protocol;
    } catch {
      return "https:";
    }
  }, [page.threadUrl]);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    titleUpdatedRef.current = false;

    try {
      const result = await container.thread.getThread(page.threadUrl, {
        forceUpdate: refreshKey > 0,
        onCache: (cached: IThreadDetail) => {
          if (cached.res) {
            setResponses(cached.res);
          }
          if (cached.title && !titleUpdatedRef.current) {
            dispatch({
              type: "UPDATE_TITLE_FOR_TAB",
              tabId,
              title: cached.title,
            });
            titleUpdatedRef.current = true;
          }
          // 自動更新では cache 描画のあとに本体レスポンスが続くことがある。
          // ここで loading を下ろすと「更新完了」と誤認して保留中スクロールを捨てるため、
          // 完了判定は最終 result / finally に寄せる。
        },
      });

      setResponses(result.res);
      setExpired(result.expired ?? false);
      if (result.title && !titleUpdatedRef.current) {
        dispatch({
          type: "UPDATE_TITLE_FOR_TAB",
          tabId,
          title: result.title,
        });
      }
      if (result.message) {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "スレッドの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [page.threadUrl, refreshKey, dispatch, tabId]);

  useEffect(() => {
    void fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    // NG設定が更新された通知を受け取ったら、現在表示中のレスに対して判定を再実行する。
    // これにより、設定画面での変更が即座にスレッド表示へ反映される。
    const handleNgChanged = () => {
      setResponses((prev) =>
        prev.map((res) => ({
          ...res,
          // res.ng が undefined の場合は ResItem 側で非NGとして扱われるため、
          // 判定結果をそのまま（null の場合は undefined へ変換して）上書きする。
          ng:
            container.ng.isNGThread(res, page.title, page.threadUrl) ??
            undefined,
        })),
      );
    };

    container.message.on("ng_changed", handleNgChanged);
    return () => {
      container.message.off("ng_changed", handleNgChanged);
    };
  }, [page.title, page.threadUrl]);

  const indexes = useMemo(() => buildIndexes(responses), [responses]);

  const filteredResponses = useMemo(() => {
    let list = responses;

    if (filter !== "all") {
      list = list.filter((res) => {
        switch (filter) {
          case "popular":
            return (indexes.repIndex.get(res.num)?.size ?? 0) >= 3;
          case "image":
            return hasImage(res.message);
          case "video":
            return hasVideo(res.message);
          case "link":
            return hasExternalLink(res.message);
        }
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((res) => {
        const text = stripHtml(res.message).toLowerCase();
        const name = stripHtml(res.name).toLowerCase();
        return (
          text.includes(q) ||
          name.includes(q) ||
          (res.id?.toLowerCase().includes(q) ?? false)
        );
      });
    }

    return list;
  }, [responses, filter, searchQuery, indexes.repIndex]);

  const idPositions = useMemo(() => {
    const positions = new Map<number, number>();
    const counters = new Map<string, number>();

    for (const res of responses) {
      if (!res.id) continue;
      const count = (counters.get(res.id) ?? 0) + 1;
      counters.set(res.id, count);
      positions.set(res.num, count);
    }

    return positions;
  }, [responses]);

  return {
    responses,
    loading,
    error,
    expired,
    indexes,
    filteredResponses,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    fetchThread,
    idPositions,
    setResponses,
    messageProtocol,
  };
}
