import { useMemo } from "react";
import { stripHtml } from "src/core/util/strip-html";
import { buildThreadFindIndex, findThreadMatches } from "src/features/thread/domain/thread-find";
import { useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import { useThreadSnapshots } from "src/view/browser/state/thread-snapshot";
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

export function SidePanelExtract({ tabId, page }: { tabId: string; page: ThreadPage }) {
  const { state, update } = useTabViewState(tabId, page);
  const query = state.sidePanelExtractQuery ?? "";
  const snapshot = useThreadSnapshots((store) => store.entries.get(tabId)?.snapshot);
  const data = snapshot?.threadUrl === page.threadUrl ? snapshot : undefined;
  const results = useMemo(() => {
    if (!data || !query.trim()) return [];
    const matched = new Set(
      findThreadMatches(buildThreadFindIndex(data.visibleResponses), query.trim())
        .filter((match) => match.field === "body")
        .map((match) => match.resNum),
    );
    return data.visibleResponses.filter((response) => matched.has(response.num));
  }, [data, query]);
  return (
    <div className="side-panel__content">
      <input
        className="side-panel__search"
        type="search"
        aria-label="レスを抽出"
        placeholder="レスを抽出"
        value={query}
        onChange={(event) => update({ sidePanelExtractQuery: event.currentTarget.value })}
      />
      {!data ? (
        <p>スレッドの情報を取得できません。</p>
      ) : data.loading ? (
        <p>スレッドを読み込み中…</p>
      ) : data.error && data.responses.length === 0 ? (
        <p>{data.error}</p>
      ) : query.trim() ? (
        results.length === 0 ? (
          <p>一致するレスはありません。</p>
        ) : (
          <>
            <p>{results.length} 件</p>
            {results.map((response) => (
              <button
                type="button"
                className="side-panel__entry side-panel__response"
                key={response.num}
                onClick={() => requestThreadResJump(page.threadUrl, response.num, tabId, true)}
              >
                <strong>{response.num}</strong>
                <span>
                  <Highlight text={stripHtml(response.message)} query={query.trim()} />
                </span>
              </button>
            ))}
          </>
        )
      ) : null}
    </div>
  );
}
