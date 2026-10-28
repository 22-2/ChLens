import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { stripHtml } from "src/core/util/strip-html";
import { buildThreadFindIndex, findThreadMatches } from "src/features/thread/domain/thread-find";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
import { ThreadSnapshotGate } from "src/view/browser/components/ThreadSnapshotGate";
import { useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import { buildExtractResMenu } from "src/view/browser/state/thread-res-menu";
import type { ThreadSnapshot } from "src/view/browser/state/thread-snapshot";
import type { ThreadPage } from "src/view/browser/types";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { findSearchMatchRanges } from "src/view/browser/utils/search-highlight";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = findSearchMatchRanges(text, query);
  return (
    <>
      {ranges.map((range, index) => (
        <span key={range.start}>
          {text.slice(index === 0 ? 0 : ranges[index - 1].end, range.start)}
          <mark>{text.slice(range.start, range.end)}</mark>
        </span>
      ))}
      {text.slice(ranges.at(-1)?.end ?? 0)}
    </>
  );
}

function ExtractResults({
  tabId,
  threadUrl,
  snapshot,
  query,
}: {
  tabId: string;
  threadUrl: string;
  snapshot: ThreadSnapshot;
  query: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const results = useMemo(() => {
    if (!query) return snapshot.visibleResponses;
    const matched = new Set(
      findThreadMatches(buildThreadFindIndex(snapshot.visibleResponses), query)
        .filter((match) => match.field === "body")
        .map((match) => match.resNum),
    );
    return snapshot.visibleResponses.filter((response) => matched.has(response.num));
  }, [snapshot, query]);
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
                  <button
                    type="button"
                    className="side-panel__entry side-panel__response"
                    onClick={(event) => {
                      const selection = event.currentTarget.ownerDocument.getSelection();
                      // 選択した本文をコピーやNG指定するとき、選択の終了をジャンプ扱いにしない。
                      if (
                        selection &&
                        !selection.isCollapsed &&
                        event.currentTarget.contains(selection.anchorNode)
                      )
                        return;
                      requestThreadResJump(threadUrl, response.num, tabId, true);
                    }}
                    onContextMenu={(event) => {
                      const items = buildExtractResMenu(tabId, threadUrl, response);
                      if (!items) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setMenu({ x: event.clientX, y: event.clientY, items });
                    }}
                  >
                    <span className="side-panel__response-meta">
                      <strong>{response.num}</strong> {stripHtml(response.name)} {response.date}
                    </span>
                    <span>
                      <Highlight text={stripHtml(response.message)} query={query} />
                    </span>
                  </button>
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
  return (
    <div className="side-panel__content side-panel__extract">
      <input
        className="side-panel__search"
        type="search"
        aria-label="レスを抽出"
        placeholder="レスを抽出"
        value={state.sidePanelExtractQuery ?? ""}
        onChange={(event) => update({ sidePanelExtractQuery: event.currentTarget.value })}
      />
      <ThreadSnapshotGate tabId={tabId} threadUrl={page.threadUrl}>
        {(snapshot) => (
          <ExtractResults
            tabId={tabId}
            threadUrl={page.threadUrl}
            snapshot={snapshot}
            query={query}
          />
        )}
      </ThreadSnapshotGate>
    </div>
  );
}
