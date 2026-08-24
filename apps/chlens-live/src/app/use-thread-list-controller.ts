import { evaluateBoardRules, parseRuleDsl, type BoardThread, type Rule } from "@chlen/ch-lib";
import { useMemo, useState } from "react";
import type {
  ThreadListViewRow,
  ThreadListViewSortColumn,
  ThreadListViewSortDirection,
} from "../../../../src/view/shared/ThreadListView";
import { LIVE_RULES_STORAGE_KEY, LocalStorageLiveRuleRepository } from "../rules/repository";

const DEFAULT_RULES = new LocalStorageLiveRuleRepository(LIVE_RULES_STORAGE_KEY);

export interface ThreadListControllerInput {
  threads: readonly BoardThread[];
}

export interface ThreadListControllerResult {
  rows: ThreadListViewRow[];
  threadsById: ReadonlyMap<string, BoardThread>;
  query: string;
  setQuery: (query: string) => void;
  sortColumn: ThreadListViewSortColumn | null;
  sortDirection: ThreadListViewSortDirection;
  sort: (column: ThreadListViewSortColumn) => void;
}

function calcHeat(createdAt: number, resCount: number, now: number): number {
  if (!Number.isFinite(createdAt) || createdAt > now) return 0;
  const elapsedDays = Math.max((now - createdAt) / 1000, 1) / (24 * 60 * 60);
  return Number((resCount / elapsedDays).toFixed(1));
}

function loadRules(): readonly Rule[] {
  const source = DEFAULT_RULES.load();
  if (!source) return [];
  const parsed = parseRuleDsl(source);
  return parsed.recognized && parsed.diagnostics.length === 0 ? parsed.rules : [];
}

export function createThreadListRows(
  threads: readonly BoardThread[],
  rules: readonly Rule[],
  query: string,
  sortColumn: ThreadListViewSortColumn | null,
  sortDirection: ThreadListViewSortDirection,
  now = Date.now(),
): { rows: ThreadListViewRow[]; threadsById: ReadonlyMap<string, BoardThread> } {
  const threadsById = new Map<string, BoardThread>();
  const rows: ThreadListViewRow[] = [];
  const normalizedQuery = query.trim().toLocaleLowerCase();

  for (const thread of threads) {
    const match = evaluateBoardRules(rules, {
      title: thread.title,
      url: thread.url,
      resCount: thread.resCount,
    });
    if (match?.rule.action === "hide") continue;
    if (normalizedQuery && !thread.title.toLocaleLowerCase().includes(normalizedQuery)) continue;

    const state =
      match?.rule.action === "highlight"
        ? "highlight"
        : match?.rule.action === "demote"
          ? "demoted"
          : "normal";
    const row: ThreadListViewRow = {
      id: thread.url,
      num: threads.indexOf(thread) + 1,
      title: thread.title,
      resCount: thread.resCount,
      heat: calcHeat(thread.createdAt, thread.resCount, now),
      label: match?.params?.label,
      state,
    };
    rows.push(row);
    threadsById.set(row.id, thread);
  }

  if (sortColumn) {
    rows.sort((left, right) => {
      let result = 0;
      switch (sortColumn) {
        case "num":
          result =
            threads.indexOf(threadsById.get(left.id)!) -
            threads.indexOf(threadsById.get(right.id)!);
          break;
        case "title":
          result = left.title.localeCompare(right.title, "ja");
          break;
        case "resCount":
          result = left.resCount - right.resCount;
          break;
        case "heat":
          result = (left.heat ?? 0) - (right.heat ?? 0);
          break;
        case "unreadCount":
          result = (left.unreadCount ?? 0) - (right.unreadCount ?? 0);
          break;
      }
      return sortDirection === "asc" ? result : -result;
    });
  }

  return { rows, threadsById };
}

export function useThreadListController({
  threads,
}: ThreadListControllerInput): ThreadListControllerResult {
  const [query, setQuery] = useState("");
  const [rules] = useState<readonly Rule[]>(loadRules);
  const [sortState, setSortState] = useState<{
    column: ThreadListViewSortColumn | null;
    direction: ThreadListViewSortDirection;
  }>({ column: null, direction: "asc" });
  const { rows, threadsById } = useMemo(
    () => createThreadListRows(threads, rules, query, sortState.column, sortState.direction),
    [query, rules, sortState.column, sortState.direction, threads],
  );

  const sort = (column: ThreadListViewSortColumn): void => {
    setSortState((current) => {
      if (current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return { column: null, direction: "asc" };
    });
  };

  return {
    rows,
    threadsById,
    query,
    setQuery,
    sortColumn: sortState.column,
    sortDirection: sortState.direction,
    sort,
  };
}
