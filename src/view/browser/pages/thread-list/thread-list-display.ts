import {
  calcHeat,
  createHighlightDividerStyle,
  type DisplayThread,
  getThreadUnreadCount,
  isSortColumn,
  isThreadVisited,
  readThreadListSortPreference,
  type ThreadListSortColumn,
  type ThreadListSortPreference,
} from "src/features/thread-list/ui/thread-list-shared";
import type { IThread } from "src/service-container/interfaces";
import type { DataTableSection } from "src/view/browser/components/SimpleDataTable";
import {
  compileSearch,
  matcherMatches,
  type SearchOptions,
} from "src/view/browser/utils/search-normalize";
import { buildDemotedThreadSections } from "src/view/browser/utils/thread-list-demoted-sections";

/**
 * タブに保存された並べ替え状態から、初期表示の並べ替えを決める。
 * 保存値が無い（undefined）か不正なときだけ、板ごとの保存設定へ戻す。
 * null は「未ソートを選んだ」という保存値なので、板別設定で上書きしない。
 */
export function resolveSortPreference(
  persistedColumn: string | null | undefined,
  persistedDirection: "asc" | "desc" | undefined,
  boardUrl: string,
): ThreadListSortPreference {
  const direction = persistedDirection === "desc" ? "desc" : "asc";
  if (persistedColumn === null) return { column: null, direction };
  if (typeof persistedColumn === "string" && isSortColumn(persistedColumn)) {
    return { column: persistedColumn, direction };
  }
  return readThreadListSortPreference(boardUrl);
}

/** 見出しクリックによる3状態ソート: 昇順 → 降順 → デフォルト(未ソート)。 */
export function nextSortPreference(
  previous: ThreadListSortPreference,
  column: ThreadListSortColumn,
): ThreadListSortPreference {
  if (previous.column !== column) return { column, direction: "asc" };
  if (previous.direction === "asc") return { column, direction: "desc" };
  return { column: null, direction: "asc" };
}

function compareByColumn(a: DisplayThread, b: DisplayThread, column: ThreadListSortColumn): number {
  switch (column) {
    case "num":
      return a.originalIndex - b.originalIndex;
    case "title":
      return a.thread.title.localeCompare(b.thread.title, "ja");
    case "resCount":
      return a.thread.resCount - b.thread.resCount;
    case "unreadCount":
      return a.unreadCount - b.unreadCount;
    case "heat":
      return a.heat - b.heat;
    case "createdAt":
      return a.thread.createdAt - b.thread.createdAt;
  }
}

export interface BuildDisplayThreadsOptions {
  threads: readonly IThread[];
  /** 勢いの算出基準時刻。過去の履歴を表示中は、その一覧を読み込んだ時刻を渡す。 */
  now: number;
  searchQuery: string;
  searchOptions: SearchOptions;
  sort: ThreadListSortPreference;
  isBookmarked: (threadUrl: string) => boolean;
}

/** 取得済みのスレ一覧に、検索フィルタと並べ替えを適用した表示用の行を作る。 */
export function buildDisplayThreads({
  threads,
  now,
  searchQuery,
  searchOptions,
  sort,
  isBookmarked,
}: BuildDisplayThreadsOptions): DisplayThread[] {
  let list: DisplayThread[] = threads.map((thread, index) => ({
    thread,
    originalIndex: index + 1,
    isBookmarked: isBookmarked(thread.url),
    unreadCount: getThreadUnreadCount(thread),
    heat: parseFloat(calcHeat(now, thread.createdAt, thread.resCount)),
    highlightQuery: searchQuery,
    highlightOptions: searchOptions,
  }));

  if (searchQuery) {
    // 正規表現が不正な間は matcher が無く、絞り込まない（入力欄が不正を示す）。
    const { matcher } = compileSearch(searchQuery.trim(), searchOptions);
    list = list.filter(({ thread }) => matcherMatches(matcher, thread.title));
  }

  // column が null の間は取得順を維持し、デフォルト状態へ戻せるようにする。
  const { column, direction } = sort;
  if (column) {
    list.sort((a, b) => {
      const cmp = compareByColumn(a, b, column);
      return direction === "asc" ? cmp : -cmp;
    });
  }

  return list;
}

/** NGで非表示にするスレを除いた行。一時的にNGを無効化している間は全件を残す。 */
export function filterVisibleThreads(
  rows: readonly DisplayThread[],
  isNgTemporarilyDisabled: boolean,
): DisplayThread[] {
  return rows.filter(({ thread }) => thread.ng == null || isNgTemporarilyDisabled);
}

interface HighlightGroup {
  label: string;
  color?: string;
  order: number;
  rows: DisplayThread[];
}

function getHighlightGroupKey(highlight: NonNullable<IThread["highlight"]>): string {
  // 変更理由: labelやcolorが同じでも、別のDSLルールなら独立したセクションとして扱う。
  if (highlight.ruleIndex != null) return `rule-${highlight.ruleIndex}`;
  return `legacy-${highlight.name ?? ""}-${highlight.params?.label ?? ""}-${highlight.params?.bgColor ?? ""}`;
}

function groupByHighlight(rows: readonly DisplayThread[]): Map<string, HighlightGroup> {
  const groups = new Map<string, HighlightGroup>();
  for (const item of rows) {
    const highlight = item.thread.highlight;
    if (!highlight) continue;
    const key = getHighlightGroupKey(highlight);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(item);
      continue;
    }
    groups.set(key, {
      label: highlight.params?.label || highlight.name || "注目スレ",
      color: highlight.params?.bgColor,
      order: highlight.ruleIndex ?? Number.MAX_SAFE_INTEGER,
      rows: [item],
    });
  }
  return groups;
}

/** 表示対象の行を、注目スレ → 通常 → 降格（NG）の順のセクションへ分ける。 */
export function buildThreadSections(
  visibleRows: readonly DisplayThread[],
  isNgTemporarilyDisabled: boolean,
): DataTableSection<DisplayThread>[] {
  const highlightGroups = groupByHighlight(visibleRows);
  const normal = visibleRows.filter(
    ({ thread }) => thread.highlight == null && (isNgTemporarilyDisabled || thread.demoted == null),
  );
  const demoted = isNgTemporarilyDisabled
    ? []
    : visibleRows.filter(({ thread }) => thread.demoted != null);

  return [
    ...Array.from(highlightGroups.entries())
      .sort(([, left], [, right]) => left.order - right.order)
      .map(([key, group]) => ({
        key: `highlight-${key}`,
        label: `${group.label}（${group.rows.length}）`,
        rows: group.rows,
        ...(group.color ? { dividerStyle: createHighlightDividerStyle(group.color) } : {}),
      })),
    ...(normal.length > 0
      ? [{ key: "normal", label: `スレ一覧（${normal.length}）`, rows: normal }]
      : []),
    ...buildDemotedThreadSections(demoted, (item) => item.thread.demoted),
  ];
}

/** 取得済み一覧全体のNG・注目件数。検索やソートの表示結果ではなく全体を基準にする。 */
export function countThreadListFlags(threads: readonly IThread[]): {
  ngCount: number;
  highlightCount: number;
} {
  let ngCount = 0;
  let highlightCount = 0;
  for (const thread of threads) {
    if (thread.ng != null || thread.demoted != null) ngCount += 1;
    if (thread.highlight != null) highlightCount += 1;
  }
  return { ngCount, highlightCount };
}

export function getThreadRowClassName(
  thread: IThread,
  isNgTemporarilyDisabled: boolean,
): string | undefined {
  const classes: string[] = [];
  if (isThreadVisited(thread)) classes.push("thread-list__row--visited");
  if (thread.demoted && !isNgTemporarilyDisabled) classes.push("thread-list__row--ng");
  if (thread.highlight) classes.push("thread-list__row--highlight");
  return classes.join(" ") || undefined;
}
