import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { platform } from "src/app";
import { container } from "src/service-container/index";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";
import { useTabDispatch, useTabViewState } from "src/view/browser/hooks/use-tab-store";
import type {
  ThreadFilter,
  ThreadPage as ThreadPageType,
  ThreadSearchTarget,
} from "src/view/browser/types";
import {
  captureRootSelection,
  restoreRootSelection,
  type RootSelectionSnapshot,
} from "src/view/browser/utils/dom-selection";
import { buildIndexes } from "src/view/browser/utils/thread-index";
import { filterThreadResponses } from "src/view/browser/utils/thread-search";
import { hasExternalLink, hasImage, hasVideo } from "src/view/browser/utils/utils";
import type { ThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";

// 変更理由: タブ再マウント時やブラウザ再起動後に「読み込み中」しか表示されないのを防ぐため、
// 前回の取得結果をIDBに永続化し、新しいデータの取得中は古い結果を表示し続ける。
const UI_CACHE_STORE = "UICache";
const threadCacheKey = (threadUrl: string) => `thread:${threadUrl}`;

const getThreadCache = async (threadUrl: string): Promise<IRes[] | null> => {
  try {
    const store = platform.storage.getStore(UI_CACHE_STORE);
    const entry = (await store.get(threadCacheKey(threadUrl))) as
      | { url: string; data: IRes[] }
      | undefined;
    return entry?.data ?? null;
  } catch {
    return null;
  }
};

const setThreadCache = async (threadUrl: string, responses: IRes[]): Promise<void> => {
  try {
    const store = platform.storage.getStore(UI_CACHE_STORE);
    await store.put({ url: threadCacheKey(threadUrl), data: responses });
  } catch (error) {
    console.error("[useThreadData] cache save failed:", error);
  }
};

interface ThreadData {
  responses: IRes[];
  visibleResponses: IRes[];
  loading: boolean;
  error: string | null;
  expired: boolean;
  missingFromSubject: boolean;
  indexes: ReturnType<typeof buildIndexes>;
  filteredResponses: IRes[];
  filter: ThreadFilter;
  setFilter: Dispatch<SetStateAction<ThreadFilter>>;
  searchTarget: ThreadSearchTarget;
  setSearchTarget: Dispatch<SetStateAction<ThreadSearchTarget>>;
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
  rootRef: RefObject<HTMLDivElement | null>,
  refreshController: ThreadRefreshController,
): ThreadData {
  const dispatch = useTabDispatch();
  const { beginRequest, isLatestRequest, refreshKey } = refreshController;
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, page);
  const [responses, setResponsesState] = useState<IRes[]>([]);
  const selectionSnapshotRef = useRef<RootSelectionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [missingFromSubject, setMissingFromSubject] = useState(false);
  const [filter, setFilter] = useState<ThreadFilter>(() => persistedViewState.filter ?? "all");
  const [searchTarget, setSearchTarget] = useState<ThreadSearchTarget>(() => {
    const persistedSearchTarget = persistedViewState.searchTarget;
    return persistedSearchTarget === "body" ||
      persistedSearchTarget === "name" ||
      persistedSearchTarget === "id"
      ? persistedSearchTarget
      : "all";
  });
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const [showSearch, setShowSearch] = useState(false);
  const titleUpdatedRef = useRef(false);

  useEffect(() => {
    updateViewState({ filter, searchQuery, searchTarget });
  }, [filter, searchQuery, searchTarget, updateViewState]);

  const setResponses = useCallback<Dispatch<SetStateAction<IRes[]>>>(
    (nextResponses) => {
      // 変更理由: 自動更新の通信完了時にレス本文が再描画されても、
      // 本文または同じ thread-page 配下のポップアップで行った文字選択を失わせない。
      const snapshot = captureRootSelection(rootRef.current);
      if (snapshot) {
        selectionSnapshotRef.current = snapshot;
      }
      setResponsesState(nextResponses);
    },
    [rootRef],
  );

  useLayoutEffect(() => {
    const snapshot = selectionSnapshotRef.current;
    if (!snapshot) {
      return;
    }
    selectionSnapshotRef.current = null;
    restoreRootSelection(rootRef.current, snapshot);
  }, [responses, rootRef]);

  const messageProtocol = useMemo(() => {
    try {
      return new window.URL(page.threadUrl).protocol;
    } catch {
      return "https:";
    }
  }, [page.threadUrl]);

  const fetchThread = useCallback(async () => {
    const requestId = beginRequest();
    const isCurrentRequest = () => isLatestRequest(requestId);

    setLoading(true);
    setError(null);
    // 変更理由: ThreadPage は別スレへの移動時にも再利用される。取得に失敗した場合でも
    // 前スレの dat落ち・subject不在表示を残さないよう、取得結果を待たずにリセットする。
    setExpired(false);
    setMissingFromSubject(false);
    titleUpdatedRef.current = false;

    try {
      const result = await container.thread.getThread(page.threadUrl, {
        forceUpdate: refreshKey > 0,
        onCache: (cached: IThreadDetail) => {
          // 変更理由: 更新を短時間に連続実行すると、先に開始した取得が後から完了する
          // ことがある。古い取得結果でレス・タイトル・loading状態を巻き戻さないため、
          // 最新リクエストのキャッシュ通知だけを画面へ反映する。
          if (!isCurrentRequest()) {
            return;
          }
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

      // 変更理由: 投稿直後の再取得と手動更新が重なった場合も、最新の取得結果を
      // 優先して表示し、古いレス数で自動スクロール判定を確定させないようにする。
      if (!isCurrentRequest()) {
        return;
      }
      setResponses(result.res);
      void setThreadCache(page.threadUrl, result.res);
      setExpired(result.expired ?? false);
      setMissingFromSubject(result.missingFromSubject ?? false);
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
      if (!isCurrentRequest()) {
        return;
      }
      setError(e instanceof Error ? e.message : "スレッドの取得に失敗しました");
    } finally {
      // 変更理由: 古いリクエストの finally で loading を下ろすと、最新リクエストが
      // 通信中でも自動スクロール側が「更新完了」と誤認して保留状態を消費してしまう。
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [dispatch, beginRequest, isLatestRequest, page.threadUrl, refreshKey, setResponses, tabId]);

  // 変更理由: IDBキャッシュから前回のレスを復元し、新しいデータの取得中は古い結果を表示し続ける。
  useEffect(() => {
    void (async () => {
      const cached = await getThreadCache(page.threadUrl);
      if (cached && cached.length > 0) {
        setResponses(cached);
      }
    })();
  }, [page.threadUrl, setResponses]);

  useEffect(() => {
    void fetchThread();
  }, [fetchThread]);

  useEffect(() => {
    // NG設定が更新された通知を受け取ったら、現在表示中のレスに対して判定を再実行する。
    // これにより、設定画面での変更が即座にスレッド表示へ反映される。
    const handleNgChanged = () => {
      setResponses((prev) => {
        // 返信数NGは表示対象だけで数えると、他のNGルールとの適用順に依存してしまう。
        // NG判定前の全レスから索引を作り、同じスレの実レス数を基準に再判定する。
        const allIndexes = buildIndexes(prev);
        return prev.map((res) => ({
          ...res,
          // res.ng が undefined の場合は ResItem 側で非NGとして扱われるため、
          // 判定結果をそのまま（null の場合は undefined へ変換して）上書きする。
          ng:
            container.ng.isNGThread(
              {
                ...res,
                replyCount: allIndexes.repIndex.get(res.num)?.size ?? 0,
                anchorCount: allIndexes.ancIndex.get(res.num)?.size ?? 0,
              },
              page.title,
              page.threadUrl,
            ) ?? undefined,
        }));
      });
    };

    container.message.on("ng_changed", handleNgChanged);
    return () => {
      container.message.off("ng_changed", handleNgChanged);
    };
  }, [page.title, page.threadUrl, setResponses]);

  const visibleResponses = useMemo(() => {
    // 変更理由: NGレスはResItemがプレースホルダーとして描画するため、一覧DOMから除外すると
    // `anchor--ng-target` のジャンプ先が消えてスクロールできなくなる。内容の伏せ方はResItemへ
    // 集約し、ここでは全レスを残して通常レスと同じジャンプ先を確保する。
    return responses;
  }, [responses]);

  const indexes = useMemo(() => {
    // 本文のNG内容はプレースホルダーで伏せる一方、アンカープレビュー・返信ツリー・
    // IDポップアップでは参照できる必要があるため、索引は常に全レスから構築する。
    return buildIndexes(responses);
  }, [responses]);

  const filteredResponses = useMemo(() => {
    let list = visibleResponses;

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
      list = filterThreadResponses(list, searchQuery, searchTarget);
    }

    return list;
  }, [visibleResponses, filter, searchQuery, searchTarget, indexes.repIndex]);

  const idPositions = useMemo(() => {
    const positions = new Map<number, number>();
    const counters = new Map<string, number>();

    for (const res of visibleResponses) {
      if (!res.id) continue;
      const count = (counters.get(res.id) ?? 0) + 1;
      counters.set(res.id, count);
      positions.set(res.num, count);
    }

    return positions;
  }, [visibleResponses]);

  return {
    responses,
    visibleResponses,
    loading,
    error,
    expired,
    missingFromSubject,
    indexes,
    filteredResponses,
    filter,
    setFilter,
    searchTarget,
    setSearchTarget,
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
