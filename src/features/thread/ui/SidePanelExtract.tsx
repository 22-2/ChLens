import { useMemo } from "react";
import { stripHtml } from "src/core/util/strip-html";
import { buildThreadFindIndex, findThreadMatches } from "src/features/thread/domain/thread-find";
import { SidePanelMessage } from "src/view/browser/components/SidePanelMessage";
import { ThreadSnapshotGate } from "src/view/browser/components/ThreadSnapshotGate";
import { useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import type { ThreadSnapshot } from "src/view/browser/state/thread-snapshot";
import type { ThreadPage } from "src/view/browser/types";
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
  const results = useMemo(() => {
    const matched = new Set(
      findThreadMatches(buildThreadFindIndex(snapshot.visibleResponses), query)
        .filter((match) => match.field === "body")
        .map((match) => match.resNum),
    );
    return snapshot.visibleResponses.filter((response) => matched.has(response.num));
  }, [snapshot, query]);
  if (results.length === 0) return <SidePanelMessage>一致するレスはありません。</SidePanelMessage>;
  return (
    <>
      <p>{results.length} 件</p>
      {results.map((response) => (
        <button
          type="button"
          className="side-panel__entry side-panel__response"
          key={response.num}
          onClick={() => requestThreadResJump(threadUrl, response.num, tabId, true)}
        >
          <strong>{response.num}</strong>
          <span>
            <Highlight text={stripHtml(response.message)} query={query} />
          </span>
        </button>
      ))}
    </>
  );
}

export function SidePanelExtract({ tabId, page }: { tabId: string; page: ThreadPage }) {
  const { state, update } = useTabViewState(tabId, page);
  const query = (state.sidePanelExtractQuery ?? "").trim();
  return (
    <div className="side-panel__content">
      <input
        className="side-panel__search"
        type="search"
        aria-label="レスを抽出"
        placeholder="レスを抽出"
        value={state.sidePanelExtractQuery ?? ""}
        onChange={(event) => update({ sidePanelExtractQuery: event.currentTarget.value })}
      />
      <ThreadSnapshotGate tabId={tabId} threadUrl={page.threadUrl}>
        {(snapshot) =>
          // 空欄では結果も件数も出さない。
          query ? (
            <ExtractResults
              tabId={tabId}
              threadUrl={page.threadUrl}
              snapshot={snapshot}
              query={query}
            />
          ) : null
        }
      </ThreadSnapshotGate>
    </div>
  );
}
