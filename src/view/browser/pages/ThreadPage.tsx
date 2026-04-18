import { ArrowDown, Ban, Copy, Globe, History, Reply, Search, Type } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import { AnchorPreview } from "src/view/browser/components/AnchorPreview";
import { ContextMenu } from "src/view/browser/components/ContextMenu";
import { SearchBar } from "src/view/browser/components/SearchBar";
import { useMouseGesture } from "src/view/browser/hooks/use-mouse-gesture";
import { useMediaViewer } from "src/view/browser/hooks/use-media-viewer";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
  POPUP_BASE_Z,
} from "src/view/browser/utils/constants";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { ResItem } from "src/view/browser/components/ResItem";
import { ResPopup } from "src/view/browser/components/ResPopup";
import {
  AnchorPreviewState,
  PopupState,
  Props,
  ResContextMenuState,
  ThreadFilter,
  TreePopupState,
} from "src/view/browser/utils/types";
import { buildKyodemoUrl, copyText, stripHtml } from "src/view/browser/utils/utils";

export const ThreadPage: React.FC<Props> = ({ page, refreshKey }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const {
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
  } = useThreadData(page, refreshKey);
  const {
    viewer,
    viewerScale,
    viewerStageRef,
    openMediaFromUrl,
    closeViewer,
    navigateViewer,
    setViewerScale,
  } = useMediaViewer();

  useMouseGesture(rootRef);

  const [popup, setPopup] = useState<PopupState | null>(null);
  const [treePopups, setTreePopups] = useState<TreePopupState[]>([]);
  const [resContextMenu, setResContextMenu] =
    useState<ResContextMenuState | null>(null);
  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());
  const [anchorPreviews, setAnchorPreviews] = useState<AnchorPreviewState[]>([]);
  const anchorPreviewHideTimerRef = useRef<number | null>(null);
  // 開いた順にz-indexを単調増加させる。後から開いたポップアップが常に前面に表示される。
  // AnchorPreview内でrepクリック → ReplyTreePopupが前面に出る、などの重なり順を保証する。
  const zCounterRef = useRef(POPUP_BASE_Z);
  const getNextZ = useCallback(() => ++zCounterRef.current, []);

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
  }, [setShowSearch]);

  /**
   * viewport座標（e.clientX/Y）を .thread-page 内の absolute 座標に変換する。
   * position:absolute を使ってポップアップをスクロール連動させるために必要。
   * getBoundingClientRect().top はスクロール量を反映した viewport 上の位置を返すため、
   * scrollTop を別途加算する必要はない。
   */
  const toPageCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!rootRef.current) return { x: clientX, y: clientY };
      const rect = rootRef.current.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [],
  );

  // IDクリック → そのIDの全レスをポップアップ表示
  const handleIdClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const resNums = indexes.idIndex.get(id);
      if (!resNums) return;
      hideAnchorPreviewImmediately();
      const items = Array.from(resNums)
        .sort((a, b) => a - b)
        .map((num) => indexes.resMap.get(num))
        .filter((r): r is IRes => !!r);
      const { x, y } = toPageCoords(e.clientX, e.clientY);
      setPopup({ x, y, items, title: `ID:${id} (${items.length}件)`, z: getNextZ() });
      setTreePopups([]);
    },
    [indexes, toPageCoords, getNextZ],
  );

  // 返信クリック → 返信ツリーをポップアップ表示（スレッド本文から）
  const handleRepClick = useCallback(
    (resNum: number, e: React.MouseEvent) => {
      hideAnchorPreviewImmediately();
      const { x, y } = toPageCoords(e.clientX, e.clientY);
      // 本文からの返信クリックは既存ポップアップをすべてリセットして新規スタック開始
      setTreePopups([{ x, y, resNum, z: getNextZ() }]);
      setPopup(null);
    },
    [toPageCoords, getNextZ],
  );

  const closePopup = useCallback(() => {
    hideAnchorPreviewImmediately();
    setPopup(null);
    setTreePopups([]);
  }, []);

  const closeResContextMenu = useCallback(() => {
    setResContextMenu(null);
  }, []);

  const clearAnchorPreviewHideTimer = useCallback(() => {
    if (anchorPreviewHideTimerRef.current != null) {
      window.clearTimeout(anchorPreviewHideTimerRef.current);
      anchorPreviewHideTimerRef.current = null;
    }
  }, []);

  // ポップアップ/アンカープレビュー内からの返信クリック。
  // アンカープレビューを即時消去せず、スタックに積んで親子関係を維持する。
  // z-indexはgetNextZ()により「後から開いたものが前面」が保証されるため、
  // AnchorPreview内からの返信でもReplyTreePopupが正しく前面に表示される。
  const handleRepClickInPopup = useCallback(
    (resNum: number, e: React.MouseEvent) => {
      clearAnchorPreviewHideTimer();
      const { x, y } = toPageCoords(e.clientX, e.clientY);
      setTreePopups((prev) => [...prev, { x, y, resNum, z: getNextZ() }]);
      // 親ポップアップ（ResPopup / AnchorPreview）は閉じない
    },
    [clearAnchorPreviewHideTimer, toPageCoords, getNextZ],
  );

  const hideAnchorPreviewImmediately = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      setAnchorPreviews((prev) => prev.slice(0, fromDepth));
    },
    [clearAnchorPreviewHideTimer],
  );

  const hideAnchorPreview = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      // 親子プレビュー間を横断する間は少し猶予を持たせ、子プレビューに入ったら閉じを打ち消す。
      anchorPreviewHideTimerRef.current = window.setTimeout(() => {
        anchorPreviewHideTimerRef.current = null;
        setAnchorPreviews((prev) => prev.slice(0, fromDepth));
      }, ANCHOR_PREVIEW_HIDE_DELAY_MS);
    },
    [clearAnchorPreviewHideTimer],
  );

  const showAnchorPreview = useCallback(
    (targets: number[], anchorRect: DOMRect, label: string, depth: number) => {
      clearAnchorPreviewHideTimer();
      if (targets.length === 0) {
        setAnchorPreviews((prev) => prev.slice(0, depth));
        return;
      }
      const items = targets
        .map((num) => indexes.resMap.get(num))
        .filter((res): res is IRes => !!res);
      if (items.length === 0) {
        setAnchorPreviews((prev) => prev.slice(0, depth));
        return;
      }
      const maxWidth = Math.min(
        ANCHOR_PREVIEW_MAX_WIDTH,
        window.innerWidth - ANCHOR_PREVIEW_GUTTER * 2,
      );
      // まず viewport 座標でビューポート内に収まる位置を計算し、page 座標に変換する
      const vx = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.left,
          window.innerWidth - maxWidth - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const vy = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.bottom + ANCHOR_PREVIEW_OFFSET,
          window.innerHeight - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const { x, y } = toPageCoords(vx, vy);
      // 旧PopupViewと同様に深さごとのスタックで保持し、子プレビュー表示中も親を残す。
      setAnchorPreviews((prev) => {
        const next = prev.slice(0, depth);
        next.push({ depth, x, y, items, label, z: getNextZ() });
        return next;
      });
    },
    [clearAnchorPreviewHideTimer, indexes.resMap, toPageCoords, getNextZ],
  );

  useEffect(() => {
    return () => {
      if (anchorPreviewHideTimerRef.current != null) {
        window.clearTimeout(anchorPreviewHideTimerRef.current);
      }
    };
  }, []);

  const addIdToNg = useCallback(async (id: string | undefined) => {
    if (!id) return;
    const ngWord = id.startsWith("ID:") ? id : `ID:${id}`;
    // 既存実装の「ID/IPをNG指定」と同じくNGサービスへ直接追加
    container.ng.add(ngWord);
    // サービス側への追加だけでは再取得するまでUIに反映されないため、ローカルのstateも即時更新する。
    // id は targetRes.id そのもの（"ID:xxx" 形式の場合もある）なので、そのまま res.id と比較する。
    setResponses((prev) =>
      prev.map((res) =>
        res.id === id
          ? {
              ...res,
              // res.ng を設定することで ResItem の isNG 判定が即座に true になる
              ng: { type: "id" },
              class: [...(res.class ?? []).filter((c) => c !== "ng"), "ng"],
            }
          : res,
      ),
    );
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
    [page.threadUrl],
  );

  const filterButtons: { key: ThreadFilter; label: string }[] = [
    { key: "all", label: "全て" },
    { key: "popular", label: "多レス" },
    { key: "image", label: "画像" },
    { key: "video", label: "動画" },
    { key: "link", label: "リンク" },
  ];

  // アンカークリックで該当レスへスクロール
  const handleAnchorClick = useCallback(
    (resNum: number) => {
      const host = rootRef.current;
      if (!host) return;
      hideAnchorPreviewImmediately();
      const target = host.querySelector(`[data-res-num="${resNum}"]`);
      if (!target) return;
      const scrollContainer = host.closest(".content-area");
      if (
        scrollContainer instanceof HTMLElement &&
        target instanceof HTMLElement
      ) {
        // ThreadPageでは content-area が実スクロールコンテナなので、そこへ直接位置合わせする。
        const targetRect = target.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const nextScrollTop =
          scrollContainer.scrollTop + targetRect.top - containerRect.top;
        scrollContainer.scrollTo({
          top: Math.max(0, nextScrollTop),
          behavior: "auto",
        });
      } else {
        target.scrollIntoView({ behavior: "auto", block: "start" });
      }
      // 視認性のためハイライトアニメーションを付与
      target.classList.add("res--highlighted");
      target.addEventListener(
        "animationend",
        () => target.classList.remove("res--highlighted"),
        { once: true },
      );
    },
    [hideAnchorPreviewImmediately],
  );

  /**
   * コンテキストメニュー項目を生成する汎用関数。
   * fromPopup=true のときはポップアップ固有の「このレスにジャンプ」を先頭に追加する。
   */
  const buildContextMenuItems = useCallback(
    (targetRes: IRes, fromPopup: boolean) => {
      const plainName = stripHtml(targetRes.name);
      const plainMessage = stripHtml(targetRes.message);
      const rawId = targetRes.id ?? "";
      const kyodemoUrl = rawId ? buildKyodemoUrl(page.threadUrl, rawId) : null;
      const permalink = `${page.threadUrl}${targetRes.num}`;
      const isMiniAa = miniAaResNums.has(targetRes.num);

      return [
        ...(fromPopup
          ? [
              {
                id: "jump-to-res",
                label: "このレスにジャンプ",
                icon: <ArrowDown size={14} />,
                onSelect: () => {
                  handleAnchorClick(targetRes.num);
                  closePopup();
                },
              },
              { id: "sep-jump", separator: true },
            ]
          : []),
        {
          id: "copy-res",
          label: "レスをコピー",
          icon: <Copy size={14} />,
          onSelect: async () => {
            const copyBody = `${page.title}\n${page.threadUrl}${targetRes.num}\n${targetRes.num} ${plainName}  ${targetRes.date ?? targetRes.other ?? ""}\n${plainMessage}`;
            await copyText(copyBody);
          },
        },
        {
          id: "copy-id",
          label: "ID/IPをコピー",
          icon: <Copy size={14} />,
          disabled: !rawId,
          onSelect: async () => {
            await copyText(rawId);
          },
        },
        {
          id: "search-id",
          label: "IDを必死チェッカーで検索",
          icon: <Search size={14} />,
          disabled: !kyodemoUrl,
          onSelect: () => {
            if (kyodemoUrl) {
              window.open(kyodemoUrl, "_blank", "noopener,noreferrer");
            }
          },
        },
        {
          id: "add-ng-id",
          label: "ID/IPをNG指定",
          icon: <Ban size={14} />,
          disabled: !rawId,
          onSelect: () => {
            void addIdToNg(rawId);
          },
        },
        { id: "sep-1", separator: true },
        {
          id: "reply",
          label: "返信",
          icon: <Reply size={14} />,
          onSelect: () => {
            void copyText(`>>${targetRes.num}\n`);
            container.notification.info("返信アンカーをコピーしました");
          },
        },
        {
          id: "quote-reply",
          label: "引用して返信",
          icon: <Reply size={14} />,
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
          label: "書込履歴に追加",
          icon: <History size={14} />,
          onSelect: () => {
            void addWriteHistory(targetRes);
          },
        },
        {
          id: "toggle-aa",
          label: isMiniAa ? "AA表示モードを解除" : "AA表示モードに変更",
          icon: <Type size={14} />,
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
          label: "ブラウザで開く",
          icon: <Globe size={14} />,
          onSelect: () => {
            window.open(permalink, "_blank", "noopener,noreferrer");
          },
        },
      ];
    },
    [
      addIdToNg,
      addWriteHistory,
      closePopup,
      handleAnchorClick,
      miniAaResNums,
      page.threadUrl,
      page.title,
      setMiniAaResNums,
    ],
  );

  // ポップアップ内レス用（「このレスにジャンプ」付き）のメニュービルダー
  const buildPopupContextMenuItems = useCallback(
    (res: IRes) => buildContextMenuItems(res, true),
    [buildContextMenuItems],
  );

  // スレッド本文の右クリックメニュー項目
  const responseContextItems = useMemo(
    () =>
      resContextMenu ? buildContextMenuItems(resContextMenu.res, false) : [],
    [buildContextMenuItems, resContextMenu],
  );

  // ジェスチャーuseEffectでrootRefが確実にマウント済みになるよう、loading中の早期returnを廃止し常にrootRef付きdivを描画する
  return (
    <div ref={rootRef} className="thread-page">
      {loading && responses.length === 0 ? (
        <div className="page-status">読み込み中...</div>
      ) : error && responses.length === 0 ? (
        <div className="page-status page-status--error">
          <p>{error}</p>
          <button className="page-status__retry" onClick={fetchThread}>
            再試行
          </button>
        </div>
      ) : (
        <>
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
                  messageProtocol={messageProtocol}
                  onIdClick={handleIdClick}
                  onRepClick={handleRepClick}
                  onUrlClick={openMediaFromUrl}
                  onAnchorClick={handleAnchorClick}
                  onAnchorHover={showAnchorPreview}
                  onAnchorLeave={hideAnchorPreview}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    hideAnchorPreviewImmediately();
                    const { x, y } = toPageCoords(e.clientX, e.clientY);
                    setResContextMenu({ x, y, res });
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

          {anchorPreviews.map((anchorPreview) => (
            <AnchorPreview
              key={`anchor-preview-${anchorPreview.depth}`}
              depth={anchorPreview.depth}
              x={anchorPreview.x}
              y={anchorPreview.y}
              items={anchorPreview.items}
              label={anchorPreview.label}
              messageProtocol={messageProtocol}
              repIndex={indexes.repIndex}
              onUrlClick={openMediaFromUrl}
              onRepClick={handleRepClickInPopup}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={showAnchorPreview}
              onAnchorLeave={hideAnchorPreview}
              onMouseEnter={clearAnchorPreviewHideTimer}
              onMouseLeave={() => hideAnchorPreview(anchorPreview.depth)}
              buildContextMenuItems={buildPopupContextMenuItems}
              zIndex={anchorPreview.z}
            />
          ))}

          {/* IDポップアップ */}
          {popup && (
            <ResPopup
              x={popup.x}
              y={popup.y}
              title={popup.title}
              items={popup.items}
              messageProtocol={messageProtocol}
              repIndex={indexes.repIndex}
              onUrlClick={openMediaFromUrl}
              onRepClick={handleRepClickInPopup}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={showAnchorPreview}
              onAnchorLeave={hideAnchorPreview}
              buildContextMenuItems={buildPopupContextMenuItems}
              // 子ポップアップ（TreePopup / AnchorPreview）が開いている間は外側クリックで閉じない。
              // AnchorPreview内のmousedownがdocumentに伝播してResPopupを閉じてしまうのを防ぐ。
              disableOutsideClick={treePopups.length > 0 || anchorPreviews.length > 0}
              zIndex={popup.z}
              onClose={closePopup}
              onMouseEnter={clearAnchorPreviewHideTimer}
              onMouseLeave={() => hideAnchorPreview(0)}
            />
          )}

          {/* 返信ツリーポップアップスタック（親子関係を保ちつつ積み重ねる） */}
          {treePopups.map((tp, i) => (
            <ReplyTreePopup
              key={i}
              x={tp.x}
              y={tp.y}
              resNum={tp.resNum}
              repIndex={indexes.repIndex}
              resMap={indexes.resMap}
              messageProtocol={messageProtocol}
              onUrlClick={openMediaFromUrl}
              onRepClick={handleRepClickInPopup}
              onAnchorClick={handleAnchorClick}
              onAnchorHover={showAnchorPreview}
              onAnchorLeave={hideAnchorPreview}
              buildContextMenuItems={buildPopupContextMenuItems}
              // 上位ポップアップまたはAnchorPreviewが開いている間は外側クリックで閉じない。
              // AnchorPreview内のmousedownがdocumentに伝播してTreePopupを閉じてしまうのを防ぐ。
              disableOutsideClick={i < treePopups.length - 1 || anchorPreviews.length > 0}
              // 開いた順にカウントされたz-indexで「後から開いたものが前面」を保証する
              zIndex={tp.z}
              onClose={() => setTreePopups((prev) => prev.slice(0, i))}
              onMouseEnter={clearAnchorPreviewHideTimer}
              onMouseLeave={() => hideAnchorPreview(0)}
            />
          ))}

          {viewer && (
            <div className="media-viewer" onClick={closeViewer}>
              <div
                className="media-viewer__chrome"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="media-viewer__toolbar">
                  <span className="media-viewer__label">{viewer.label}</span>
                  <div className="media-viewer__actions">
                    {viewer.images && viewer.images.length > 1 && (
                      <>
                        <button
                          className="media-viewer__btn"
                          onClick={() => navigateViewer(-1)}
                          title="前の画像"
                        >
                          ←
                        </button>
                        <span className="media-viewer__nav-pos">
                          {(viewer.currentIndex ?? 0) + 1}/
                          {viewer.images.length}
                        </span>
                        <button
                          className="media-viewer__btn"
                          onClick={() => navigateViewer(1)}
                          title="次の画像"
                        >
                          →
                        </button>
                      </>
                    )}
                    <button
                      className="media-viewer__btn"
                      onClick={() =>
                        setViewerScale((prev) =>
                          Math.max(0.25, +(prev - 0.25).toFixed(2)),
                        )
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
                        setViewerScale((prev) =>
                          Math.min(5, +(prev + 0.25).toFixed(2)),
                        )
                      }
                      title="拡大"
                    >
                      +
                    </button>
                    <button
                      className="media-viewer__btn"
                      onClick={closeViewer}
                      title="閉じる"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div
                  ref={viewerStageRef}
                  className="media-viewer__stage"
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
        </>
      )}
    </div>
  );
};
