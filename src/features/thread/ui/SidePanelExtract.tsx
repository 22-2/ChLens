import { useVirtualizer } from "@tanstack/react-virtual";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stripHtml } from "src/core/util/strip-html";
import { extractUrlsFromMessage } from "src/core/util/url-media";
import { useImgurAlbumMedia } from "src/features/media/application/imgur-album";
import { useThreadMediaViewerScope } from "src/features/media/browser/use-thread-media-viewer-scope";
import { ResMediaGallery } from "src/features/media/ui/ResMediaGallery";
import { buildThreadFindIndex, findThreadMatches } from "src/features/thread/domain/thread-find";
import { ResBody } from "src/features/thread/ui/ResBody";
import { getSearchError, SearchOptionsMenu } from "src/view/browser/components/SearchOptionsMenu";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
import { ThreadSnapshotGate } from "src/view/browser/components/ThreadSnapshotGate";
import { useUrlHandlers } from "src/view/browser/hooks/use-url-handlers";
import { useTabDispatch, useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import { getThreadResInteractions } from "src/view/browser/state/thread-res-interactions";
import { buildExtractResMenu } from "src/view/browser/state/thread-res-menu";
import type { ThreadSnapshot } from "src/view/browser/state/thread-snapshot";
import type { ThreadPage } from "src/view/browser/types";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { decodeResponseHtml } from "src/view/browser/utils/response-format";
import {
  compileSearch,
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
} from "src/view/browser/utils/search-normalize";
import type { ThreadHighlightMatchers } from "src/view/browser/utils/thread-query";

type ExtractResponse = ThreadSnapshot["responses"][number];
type ExtractMenu = { x: number; y: number; items: ContextMenuItem[] };
type UrlHandlers = ReturnType<typeof useUrlHandlers>;

// 抽出の一覧は本文の操作を持たない。レスへのジャンプは右クリックのメニューに残す。
const noop = () => undefined;

interface ExtractEntryProps {
  tabId: string;
  threadUrl: string;
  response: ExtractResponse;
  snapshot: ThreadSnapshot;
  searchHighlight: ThreadHighlightMatchers;
  resMap: ReadonlyMap<number, unknown>;
  ngResNums: ReadonlySet<number>;
  urlHandlers: UrlHandlers;
  onContextMenu: (event: MouseEvent, response: ExtractResponse) => void;
  onOpenReplies: (event: MouseEvent<HTMLButtonElement>, resNum: number) => void;
}

// 抽出した1件。本文は本文と同じ部品で描き、リンク・アンカー・画像の操作を揃える。
function ExtractEntry({
  tabId,
  threadUrl,
  response,
  snapshot,
  searchHighlight,
  resMap,
  ngResNums,
  urlHandlers,
  onContextMenu,
  onOpenReplies,
}: ExtractEntryProps) {
  const decoded = useMemo(
    () => decodeResponseHtml(response, snapshot.messageProtocol),
    [response, snapshot.messageProtocol],
  );
  const urls = useMemo(() => extractUrlsFromMessage(decoded.messageHtml), [decoded.messageHtml]);
  const resolvedMedia = useImgurAlbumMedia(decoded.messageHtml, urls, threadUrl);
  const replyCount = snapshot.replyIndex.get(response.num)?.size ?? 0;
  return (
    <div
      className="side-panel__entry side-panel__response"
      onContextMenu={(event) => {
        // 本文の中のリンクや画像は、ブラウザ既定メニューではなく本文と同じ操作を使う。
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("a, .res__link, .res__thumb, .res__media-embed")) return;
        onContextMenu(event, response);
      }}
    >
      <span className="side-panel__response-meta">
        <strong>{response.num}</strong> {stripHtml(response.name)} {response.date}
        {replyCount > 0 && (
          <button
            type="button"
            className="side-panel__response-replies"
            onClick={(event) => onOpenReplies(event, response.num)}
          >
            返信({replyCount})
          </button>
        )}
      </span>
      <ResBody
        messageHtml={resolvedMedia.messageHtml}
        searchHighlight={searchHighlight}
        anchorPreviewDepth={0}
        ngResNums={ngResNums}
        resMap={resMap}
        onUrlClick={(url, button, mode) => urlHandlers.handleUrlClick(url, undefined, button, mode)}
        onUrlContextMenu={(url, event, mode) =>
          urlHandlers.handleUrlContextMenu(url, event, undefined, mode)
        }
        onIdLinkClick={noop}
        onAnchorClick={noop}
        onAnchorHover={(targets, rect, label) =>
          getThreadResInteractions(tabId, threadUrl)?.showAnchor(targets, rect, label)
        }
        onAnchorLeave={() => getThreadResInteractions(tabId, threadUrl)?.hideAnchor()}
      />
      {resolvedMedia.urls.length > 0 && (
        <ResMediaGallery
          urls={resolvedMedia.urls}
          onUrlClick={urlHandlers.handleUrlClick}
          isBlurred={snapshot.blurredResNums.has(response.num)}
          imageBlurRadius={snapshot.imageBlurRadius}
          blurReason={response.imageBlurReason}
        />
      )}
    </div>
  );
}

function ExtractResults({
  tabId,
  threadUrl,
  snapshot,
  query,
  searchOptions,
}: {
  tabId: string;
  threadUrl: string;
  snapshot: ThreadSnapshot;
  query: string;
  searchOptions: SearchOptions;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<ExtractMenu | null>(null);
  const dispatch = useTabDispatch();
  const { openMediaFromUrl } = useThreadMediaViewerScope(tabId, threadUrl);
  // URLの右クリックメニューは、この一覧の中で開く。
  const addPopupContextMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => {
    setMenu({ x, y, items });
    return "side-panel-extract-menu";
  }, []);
  const urlHandlers = useUrlHandlers({
    threadUrl,
    dispatch,
    openMediaFromUrl,
    addPopupContextMenu,
  });
  useEffect(
    () => () => {
      getThreadResInteractions(tabId, threadUrl)?.hideAnchor();
    },
    [tabId, threadUrl],
  );
  const resMap = useMemo(
    () => new Map(snapshot.responses.map((res) => [res.num, res])),
    [snapshot.responses],
  );
  const ngResNums = useMemo(
    () =>
      new Set(
        snapshot.responses
          .filter((res) => res.ng || res.class?.includes("ng"))
          .map((res) => res.num),
      ),
    [snapshot.responses],
  );
  // 正規表現が不正な間は判定器が無く、絞り込まない（入力欄の表示で不正を伝える）。
  const matcher = useMemo(
    () => compileSearch(query, searchOptions).matcher,
    [query, searchOptions],
  );
  // 抽出は本文だけを探すので、強調も本文だけにする。
  const searchHighlight = useMemo<ThreadHighlightMatchers>(
    () => ({ body: matcher, name: null, id: null }),
    [matcher],
  );
  const results = useMemo(() => {
    if (!matcher) return snapshot.visibleResponses;
    const matched = new Set(
      findThreadMatches(buildThreadFindIndex(snapshot.visibleResponses, searchOptions), matcher)
        .filter((match) => match.field === "body")
        .map((match) => match.resNum),
    );
    return snapshot.visibleResponses.filter((response) => matched.has(response.num));
  }, [matcher, searchOptions, snapshot]);
  // 本文の長さはレスごとに異なるため、表示した行を実測して後続の位置を補正する。
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => results[index]!.num,
    estimateSize: () => 80,
    overscan: 5,
    initialRect: { width: 0, height: 400 },
  });
  return (
    <>
      <p>{results.length} 件</p>
      <div className="side-panel__responses" ref={scrollRef}>
        {results.length === 0 ? (
          <SidePanelMessage>一致するレスはありません。</SidePanelMessage>
        ) : (
          <div className="side-panel__response-list" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const response = results[item.index]!;
              return (
                <div
                  className="side-panel__response-item"
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <ExtractEntry
                    tabId={tabId}
                    threadUrl={threadUrl}
                    response={response}
                    snapshot={snapshot}
                    searchHighlight={searchHighlight}
                    resMap={resMap}
                    ngResNums={ngResNums}
                    urlHandlers={urlHandlers}
                    onContextMenu={(event, target) => {
                      const items = buildExtractResMenu(tabId, threadUrl, target);
                      if (!items) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setMenu({ x: event.clientX, y: event.clientY, items });
                    }}
                    onOpenReplies={(event, resNum) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      getThreadResInteractions(tabId, threadUrl)?.openReplies(
                        resNum,
                        event.detail ? event.clientX : rect.left,
                        event.detail ? event.clientY : rect.bottom,
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </>
  );
}

export function SidePanelExtract({ tabId, page }: { tabId: string; page: ThreadPage }) {
  const { state, update } = useTabViewState(tabId, page);
  const query = (state.sidePanelExtractQuery ?? "").trim();
  const searchOptions = useMemo<SearchOptions>(
    () => ({ ...DEFAULT_SEARCH_OPTIONS, ...state.sidePanelExtractOptions }),
    [state.sidePanelExtractOptions],
  );
  const searchError = getSearchError(query, searchOptions);
  return (
    <div className="side-panel__content side-panel__extract">
      <div className="side-panel__search-row">
        <input
          className="side-panel__search"
          type="search"
          aria-label="レスを抽出"
          aria-invalid={searchError ? true : undefined}
          title={searchError ?? undefined}
          placeholder="レスを抽出"
          value={state.sidePanelExtractQuery ?? ""}
          onChange={(event) => update({ sidePanelExtractQuery: event.currentTarget.value })}
        />
        <SearchOptionsMenu
          options={searchOptions}
          onChange={(next) => update({ sidePanelExtractOptions: next })}
        />
      </div>
      <ThreadSnapshotGate tabId={tabId} threadUrl={page.threadUrl}>
        {(snapshot) => (
          <ExtractResults
            tabId={tabId}
            threadUrl={page.threadUrl}
            snapshot={snapshot}
            query={query}
            searchOptions={searchOptions}
          />
        )}
      </ThreadSnapshotGate>
    </div>
  );
}
