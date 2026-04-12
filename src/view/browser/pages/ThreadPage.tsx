import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useTabStore } from "../hooks/use-tab-store";
import { container } from "../../../service-container/index";
import { SearchBar } from "../components/SearchBar";
import { ContextMenu } from "../components/ContextMenu";
import type { ThreadPage as ThreadPageType } from "../types";
import type { IRes, IThreadDetail } from "../../../service-container/interfaces";

// --- アンカーパーサ ---
// MessageProcessor由来のHTML内のアンカー（>>N）から参照先レス番号を抽出する
const ANCHOR_REG =
  /(?:&gt;|＞){1,2}([\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*)/g;
const FW_NUM_REG = /[\uff10-\uff19]/g;

function parseAnchors(message: string): number[] {
  const targets: number[] = [];
  ANCHOR_REG.lastIndex = 0;
  let match;
  while ((match = ANCHOR_REG.exec(message)) !== null) {
    const raw = match[1].replace(FW_NUM_REG, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30)
    );
    const parts = raw.split(/\s*[,、]\s*/);
    for (const part of parts) {
      const range = part.split(/[\-\u30fc]/);
      const start = parseInt(range[0], 10);
      const end = range.length > 1 ? parseInt(range[1], 10) : start;
      // 25件以上の範囲指定は無視（既存動作に合わせる）
      if (isNaN(start) || isNaN(end) || end - start >= 25) continue;
      for (let i = start; i <= end; i++) {
        targets.push(i);
      }
    }
  }
  return targets;
}

// HTMLからテキストを抽出（検索フィルタ用）
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function buildKyodemoUrl(threadUrl: string, rawId: string): string | null {
  try {
    const urlObj = new window.URL(threadUrl);
    const pathParts = urlObj.pathname.split("/");
    const board = pathParts[3];
    const key = pathParts[4];
    if (!board || !key) return null;

    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;

    return `https://www.kyodemo.net/sdemo/b/e_e_${board}/?hi=${encodeURIComponent(rawId)}&key=${encodeURIComponent(key)}&date=${dateStr}`;
  } catch {
    return null;
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard APIが使えない環境向けフォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

// --- フィルタ判定 ---
function hasImage(message: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|avif)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(
    message
  );
}

function hasVideo(message: string): boolean {
  return (
    /\.(mp4|webm|avi|mov)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(message) ||
    /<video\b/i.test(message)
  );
}

function hasExternalLink(message: string): boolean {
  return /<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/i.test(message);
}

function extractUrlsFromMessage(message: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUrl = (url: string) => {
    const trimmed = url.trim().replace(/[),.;]+$/, "");
    if (!/^https?:\/\//i.test(trimmed)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message, "text/html");
    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
      pushUrl(a.getAttribute("href") ?? "");
    }
  } catch {
    // HTMLパースに失敗した場合でも正規表現抽出で継続
  }

  const textMatch = message.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  for (const url of textMatch) {
    pushUrl(url);
  }

  return result;
}

function toViewerImageUrl(rawUrl: string): string | null {
  try {
    const url = new window.URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    if (/\.(jpe?g|png|gif|webp|bmp|avif)(\?.*)?$/i.test(pathname)) {
      return url.href;
    }

    if (host === "i.imgur.com") {
      return url.href;
    }

    if (host === "imgur.com" || host === "m.imgur.com") {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length === 1) {
        const id = parts[0].split(".")[0];
        if (id) {
          return `https://i.imgur.com/${id}.jpg`;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

// --- インデックス構築 ---
interface ThreadIndexes {
  idIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
}

function buildIndexes(responses: IRes[]): ThreadIndexes {
  const idIndex = new Map<string, Set<number>>();
  const repIndex = new Map<number, Set<number>>();
  const ancIndex = new Map<number, Set<number>>();
  const resMap = new Map<number, IRes>();

  for (const res of responses) {
    resMap.set(res.num, res);

    if (res.id) {
      if (!idIndex.has(res.id)) idIndex.set(res.id, new Set());
      idIndex.get(res.id)!.add(res.num);
    }

    const targets = parseAnchors(res.message);
    for (const target of targets) {
      if (!repIndex.has(target)) repIndex.set(target, new Set());
      repIndex.get(target)!.add(res.num);
      if (!ancIndex.has(res.num)) ancIndex.set(res.num, new Set());
      ancIndex.get(res.num)!.add(target);
    }
  }

  return { idIndex, repIndex, ancIndex, resMap };
}

type ThreadFilter = "all" | "popular" | "image" | "video" | "link";

interface Props {
  page: ThreadPageType;
}

// --- ポップアップ状態 ---
interface PopupState {
  x: number;
  y: number;
  items: IRes[];
  title: string;
}

interface TreePopupState {
  x: number;
  y: number;
  resNum: number;
}

interface ResContextMenuState {
  x: number;
  y: number;
  res: IRes;
}

interface ViewerState {
  src: string;
  label: string;
}

const MAX_TREE_DEPTH = 10;

export const ThreadPage: React.FC<Props> = ({ page }) => {
  const { dispatch } = useTabStore();
  const [responses, setResponses] = useState<IRes[]>([]);
  const [, setThreadTitle] = useState(page.title);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  // タイトル更新済みかを追跡するref
  const titleUpdatedRef = useRef(false);

  // UI状態
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [treePopup, setTreePopup] = useState<TreePopupState | null>(null);
  const [resContextMenu, setResContextMenu] =
    useState<ResContextMenuState | null>(null);
  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerScale, setViewerScale] = useState(1);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    titleUpdatedRef.current = false;
    try {
      // container経由でThreadサービスにアクセス
      const result = await container.thread.getThread(page.threadUrl, {
        forceUpdate: false,
        onCache: (cached: IThreadDetail) => {
          // キャッシュデータがあれば先に表示
          if (cached.res) {
            setResponses(cached.res);
          }
          if (cached.title && !titleUpdatedRef.current) {
            setThreadTitle(cached.title);
            dispatch({ type: "UPDATE_TITLE", title: cached.title });
            titleUpdatedRef.current = true;
          }
          setLoading(false);
        },
      });

      setResponses(result.res);
      setExpired(result.expired ?? false);
      if (result.title && !titleUpdatedRef.current) {
        setThreadTitle(result.title);
        dispatch({ type: "UPDATE_TITLE", title: result.title });
      }
      if (result.message) {
        setError(result.message);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "スレッドの取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }, [page.threadUrl, dispatch]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  // レスからID/返信/アンカーのインデックスを構築
  const indexes = useMemo(() => buildIndexes(responses), [responses]);

  // Ctrl+Fで検索バーを開く
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // フィルタ & 検索適用
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

  // IDクリック → そのIDの全レスをポップアップ表示
  const handleIdClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const resNums = indexes.idIndex.get(id);
      if (!resNums) return;
      const items = Array.from(resNums)
        .sort((a, b) => a - b)
        .map((num) => indexes.resMap.get(num))
        .filter((r): r is IRes => !!r);
      setPopup({
        x: e.clientX,
        y: e.clientY,
        items,
        title: `ID:${id} (${items.length}件)`,
      });
      setTreePopup(null);
    },
    [indexes]
  );

  // 返信クリック → 返信ツリーをポップアップ表示
  const handleRepClick = useCallback(
    (resNum: number, e: React.MouseEvent) => {
      setTreePopup({ x: e.clientX, y: e.clientY, resNum });
      setPopup(null);
    },
    []
  );

  const closePopup = useCallback(() => {
    setPopup(null);
    setTreePopup(null);
  }, []);

  const closeResContextMenu = useCallback(() => {
    setResContextMenu(null);
  }, []);

  const openMediaFromUrl = useCallback((url: string) => {
    const imageUrl = toViewerImageUrl(url);
    if (imageUrl) {
      setViewer({ src: imageUrl, label: url });
      setViewerScale(1);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const closeViewer = useCallback(() => {
    setViewer(null);
  }, []);

  useEffect(() => {
    if (!viewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeViewer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeViewer, viewer]);

  const addIdToNg = useCallback(async (id: string | undefined) => {
    if (!id) return;
    const ngWord = id.startsWith("ID:") ? id : `ID:${id}`;
    // 既存実装の「ID/IPをNG指定」と同じくNGサービスへ直接追加
    container.ng.add(ngWord);
    container.notification.info(`NGに追加しました: ${ngWord}`);
  }, []);

  const addWriteHistory = useCallback(
    async (res: IRes) => {
      const globalObj = window as unknown as {
        app?: {
          WriteHistory?: {
            add: (item: {
              url: string;
              res: number;
              title: string;
              name: string;
              mail: string;
              message: string;
              date: number;
            }) => Promise<void> | void;
          };
        };
      };

      if (!globalObj.app?.WriteHistory?.add) {
        container.notification.info("書込履歴サービスが利用できません");
        return;
      }

      const name = stripHtml(res.name);
      const message = stripHtml(res.message);
      const baseTime = Date.parse(res.date ?? res.other ?? "");
      await globalObj.app.WriteHistory.add({
        url: page.threadUrl,
        res: res.num,
        title: document.title,
        name,
        mail: res.mail,
        message,
        date: Number.isNaN(baseTime) ? Date.now() : baseTime,
      });
      container.notification.success("書込履歴に追加しました");
    },
    [page.threadUrl]
  );

  // 各レスのID内通し番号を事前計算
  const idPositions = useMemo(() => {
    const positions = new Map<number, number>();
    const counters = new Map<string, number>();
    for (const res of responses) {
      if (res.id) {
        const count = (counters.get(res.id) ?? 0) + 1;
        counters.set(res.id, count);
        positions.set(res.num, count);
      }
    }
    return positions;
  }, [responses]);

  const responseContextItems = useMemo(() => {
    if (!resContextMenu) return [];
    const targetRes = resContextMenu.res;
    const plainName = stripHtml(targetRes.name);
    const plainMessage = stripHtml(targetRes.message);
    const rawId = targetRes.id ?? "";
    const kyodemoUrl = rawId ? buildKyodemoUrl(page.threadUrl, rawId) : null;
    const permalink = `${page.threadUrl}${targetRes.num}`;
    const isMiniAa = miniAaResNums.has(targetRes.num);

    return [
      {
        id: "copy-res",
        label: "📋 レスをコピー",
        onSelect: async () => {
          const copyBody = `${document.title}\n${page.threadUrl}${targetRes.num}\n${targetRes.num} ${plainName}  ${targetRes.date ?? targetRes.other ?? ""}\n${plainMessage}`;
          await copyText(copyBody);
        },
      },
      {
        id: "copy-id",
        label: "📋 ID/IPをコピー",
        disabled: !rawId,
        onSelect: async () => {
          await copyText(rawId);
        },
      },
      {
        id: "search-id",
        label: "🔎 IDを必死チェッカーで検索",
        disabled: !kyodemoUrl,
        onSelect: () => {
          if (kyodemoUrl) {
            window.open(kyodemoUrl, "_blank", "noopener,noreferrer");
          }
        },
      },
      {
        id: "add-ng-id",
        label: "🚫 ID/IPをNG指定",
        disabled: !rawId,
        onSelect: () => {
          void addIdToNg(rawId);
        },
      },
      { id: "sep-1", separator: true },
      {
        id: "reply",
        label: "↩️ 返信",
        onSelect: () => {
          void copyText(`>>${targetRes.num}\n`);
          container.notification.info("返信アンカーをコピーしました");
        },
      },
      {
        id: "quote-reply",
        label: "↩️ 引用して返信",
        onSelect: () => {
          const quoted = plainMessage
            .split(/\r?\n/)
            .map((line) => `>${line}`)
            .join("\n");
          void copyText(`>>${targetRes.num}\n${quoted}\n`);
          container.notification.info("引用テンプレートをコピーしました");
        },
      },
      {
        id: "add-write-history",
        label: "➕ 書込履歴に追加",
        onSelect: () => {
          void addWriteHistory(targetRes);
        },
      },
      {
        id: "toggle-aa",
        label: isMiniAa ? "AA表示モードを解除" : "AA表示モードに変更",
        onSelect: () => {
          setMiniAaResNums((prev) => {
            const next = new Set(prev);
            if (next.has(targetRes.num)) {
              next.delete(targetRes.num);
            } else {
              next.add(targetRes.num);
            }
            return next;
          });
        },
      },
      {
        id: "open-browser",
        label: "🌐 ブラウザで開く",
        onSelect: () => {
          window.open(permalink, "_blank", "noopener,noreferrer");
        },
      },
    ];
  }, [addIdToNg, addWriteHistory, miniAaResNums, page.threadUrl, resContextMenu]);

  if (loading && responses.length === 0) {
    return <div className="page-status">読み込み中...</div>;
  }

  if (error && responses.length === 0) {
    return (
      <div className="page-status page-status--error">
        <p>{error}</p>
        <button className="page-status__retry" onClick={fetchThread}>
          再試行
        </button>
      </div>
    );
  }

  const filterButtons: { key: ThreadFilter; label: string }[] = [
    { key: "all", label: "全て" },
    { key: "popular", label: "多レス" },
    { key: "image", label: "画像" },
    { key: "video", label: "動画" },
    { key: "link", label: "リンク" },
  ];

  return (
    <div className="thread-page">
      {/* フィルタツールバー */}
      <div className="thread-page__toolbar">
        <div className="thread-page__filters">
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              className={`thread-page__filter-btn${filter === key ? " thread-page__filter-btn--active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="thread-page__count">
          {filteredResponses.length}/{responses.length}件
        </span>
      </div>

      {showSearch && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setShowSearch(false);
            setSearchQuery("");
          }}
          hitCount={filteredResponses.length}
        />
      )}

      {expired && (
        <div className="thread-page__notice">
          このスレッドはdat落ちしています
        </div>
      )}
      {error && <div className="thread-page__notice">{error}</div>}

      <div className="thread-page__responses">
        {filteredResponses.map((res) => {
          const idCount = res.id
            ? (indexes.idIndex.get(res.id)?.size ?? 0)
            : 0;
          const idPos = res.id ? (idPositions.get(res.num) ?? 0) : 0;
          const repCount = indexes.repIndex.get(res.num)?.size ?? 0;
          return (
            <ResItem
              key={res.num}
              res={res}
              idPos={idPos}
              idCount={idCount}
              repCount={repCount}
              miniAa={miniAaResNums.has(res.num)}
              onIdClick={handleIdClick}
              onRepClick={handleRepClick}
              onUrlClick={openMediaFromUrl}
              onContextMenu={(e) => {
                e.preventDefault();
                setResContextMenu({ x: e.clientX, y: e.clientY, res });
              }}
            />
          );
        })}
      </div>

      {resContextMenu && (
        <ContextMenu
          x={resContextMenu.x}
          y={resContextMenu.y}
          items={responseContextItems}
          onClose={closeResContextMenu}
        />
      )}

      {/* IDポップアップ */}
      {popup && (
        <ResPopup
          x={popup.x}
          y={popup.y}
          title={popup.title}
          items={popup.items}
          onClose={closePopup}
        />
      )}

      {/* 返信ツリーポップアップ */}
      {treePopup && (
        <ReplyTreePopup
          x={treePopup.x}
          y={treePopup.y}
          resNum={treePopup.resNum}
          repIndex={indexes.repIndex}
          resMap={indexes.resMap}
          onClose={closePopup}
        />
      )}

      {viewer && (
        <div className="media-viewer" onClick={closeViewer}>
          <div className="media-viewer__chrome" onClick={(e) => e.stopPropagation()}>
            <div className="media-viewer__toolbar">
              <span className="media-viewer__label">{viewer.label}</span>
              <div className="media-viewer__actions">
                <button
                  className="media-viewer__btn"
                  onClick={() =>
                    setViewerScale((prev) => Math.max(0.25, +(prev - 0.25).toFixed(2)))
                  }
                  title="縮小"
                >
                  -
                </button>
                <button
                  className="media-viewer__btn"
                  onClick={() => setViewerScale(1)}
                  title="等倍"
                >
                  100%
                </button>
                <button
                  className="media-viewer__btn"
                  onClick={() =>
                    setViewerScale((prev) => Math.min(5, +(prev + 0.25).toFixed(2)))
                  }
                  title="拡大"
                >
                  +
                </button>
                <button className="media-viewer__btn" onClick={closeViewer} title="閉じる">
                  ✕
                </button>
              </div>
            </div>
            <div
              className="media-viewer__stage"
              onWheel={(e) => {
                e.preventDefault();
                setViewerScale((prev) => {
                  const next = e.deltaY < 0 ? prev + 0.15 : prev - 0.15;
                  return Math.min(5, Math.max(0.25, +next.toFixed(2)));
                });
              }}
            >
              <img
                className="media-viewer__image"
                src={viewer.src}
                alt={viewer.label}
                style={{ transform: `scale(${viewerScale})` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 個別レス表示 ---

interface ResItemProps {
  res: IRes;
  idPos: number;
  idCount: number;
  repCount: number;
  miniAa: boolean;
  onIdClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onUrlClick: (url: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const ResItem: React.FC<ResItemProps> = React.memo(
  ({
    res,
    idPos,
    idCount,
    repCount,
    miniAa,
    onIdClick,
    onRepClick,
    onUrlClick,
    onContextMenu,
  }) => {
    const isNG = res.class?.includes("ng");
    const urls = useMemo(() => extractUrlsFromMessage(res.message), [res.message]);
    const imageUrls = useMemo(
      () => urls.map((url) => ({ raw: url, src: toViewerImageUrl(url) })).filter((x) => !!x.src),
      [urls]
    );

    return (
      <article
        className={`res${isNG ? " res--ng" : ""}${miniAa ? " res--aa" : ""}`}
        onContextMenu={onContextMenu}
      >
        <header className="res__header">
          <span className="res__num">{res.num}</span>
          <span
            className="res__name"
            dangerouslySetInnerHTML={{ __html: res.name }}
          />
          {res.id && (
            <span
              className={`res__id${
                idCount >= 5
                  ? " res__id--freq"
                  : idCount >= 2
                    ? " res__id--link"
                    : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onIdClick(res.id!, e);
              }}
            >
              {res.id}
              {idCount >= 2 && `(${idPos}/${idCount})`}
            </span>
          )}
          <span className="res__date">{res.date ?? res.other}</span>
          {repCount > 0 && (
            <span
              className={`res__rep${repCount >= 5 ? " res__rep--freq" : " res__rep--link"}`}
              onClick={(e) => {
                e.stopPropagation();
                onRepClick(res.num, e);
              }}
            >
              返信({repCount})
            </span>
          )}
        </header>
        <div
          className="res__body"
          dangerouslySetInnerHTML={{ __html: res.message }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const anchor = target.closest("a");
            if (!anchor) return;
            const href = anchor.getAttribute("href") ?? "";
            if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
              return;
            }
            e.preventDefault();
            onUrlClick(href);
          }}
        />
        {urls.length > 0 && (
          <div className="res__links">
            {urls.map((url) => (
              <button
                key={`${res.num}:${url}`}
                className="res__link"
                onClick={() => onUrlClick(url)}
                title={url}
              >
                {url}
              </button>
            ))}
          </div>
        )}
        {imageUrls.length > 0 && (
          <div className="res__thumbs">
            {imageUrls.map(({ raw, src }) => (
              <button
                key={`${res.num}:thumb:${raw}`}
                className="res__thumb"
                onClick={() => onUrlClick(raw)}
                title={raw}
              >
                <img src={src ?? ""} alt={raw} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </article>
    );
  }
);
ResItem.displayName = "ResItem";

// --- IDポップアップ ---

const ResPopup: React.FC<{
  x: number;
  y: number;
  title: string;
  items: IRes[];
  onClose: () => void;
}> = ({ x, y, title, items, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // ビューポート内に収まるよう位置を補正
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, []);

  return (
    <div ref={ref} className="res-popup" style={{ left: x, top: y }}>
      <div className="res-popup__header">
        <span>{title}</span>
        <button className="res-popup__close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="res-popup__body">
        {items.map((res) => (
          <article key={res.num} className="res">
            <header className="res__header">
              <span className="res__num">{res.num}</span>
              <span
                className="res__name"
                dangerouslySetInnerHTML={{ __html: res.name }}
              />
              {res.id && <span className="res__id">{res.id}</span>}
              <span className="res__date">{res.date ?? res.other}</span>
            </header>
            <div
              className="res__body"
              dangerouslySetInnerHTML={{ __html: res.message }}
            />
          </article>
        ))}
      </div>
    </div>
  );
};

// --- 返信ツリーポップアップ ---

const ReplyTreePopup: React.FC<{
  x: number;
  y: number;
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  onClose: () => void;
}> = ({ x, y, resNum, repIndex, resMap, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ref.current.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      ref.current.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, []);

  return (
    <div ref={ref} className="res-popup" style={{ left: x, top: y }}>
      <div className="res-popup__header">
        <span>{`>>${resNum} への返信ツリー`}</span>
        <button className="res-popup__close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="res-popup__body">
        <ReplyTree
          resNum={resNum}
          repIndex={repIndex}
          resMap={resMap}
          visited={new Set()}
          depth={0}
        />
      </div>
    </div>
  );
};

// --- 再帰的返信ツリー ---

const ReplyTree: React.FC<{
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  visited: Set<number>;
  depth: number;
}> = ({ resNum, repIndex, resMap, visited, depth }) => {
  if (depth >= MAX_TREE_DEPTH) return null;
  const replies = repIndex.get(resNum);
  if (!replies || replies.size === 0) return null;

  const validReplies = Array.from(replies)
    .sort((a, b) => a - b)
    .filter((n) => !visited.has(n) && resMap.has(n));

  if (validReplies.length === 0) return null;

  return (
    <div
      className="reply-tree"
      style={{
        marginLeft: depth > 0 ? 12 : 0,
        borderLeft:
          depth > 0 ? "2px solid rgba(128, 128, 128, 0.3)" : "none",
        paddingLeft: depth > 0 ? 8 : 0,
      }}
    >
      {validReplies.map((replyNum) => {
        // 循環参照防止のためvisitedに追加
        visited.add(replyNum);
        const res = resMap.get(replyNum)!;
        return (
          <React.Fragment key={replyNum}>
            <article className="res">
              <header className="res__header">
                <span className="res__num">{res.num}</span>
                <span
                  className="res__name"
                  dangerouslySetInnerHTML={{ __html: res.name }}
                />
                {res.id && <span className="res__id">{res.id}</span>}
                <span className="res__date">{res.date ?? res.other}</span>
              </header>
              <div
                className="res__body"
                dangerouslySetInnerHTML={{ __html: res.message }}
              />
            </article>
            <ReplyTree
              resNum={replyNum}
              repIndex={repIndex}
              resMap={resMap}
              visited={visited}
              depth={depth + 1}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
