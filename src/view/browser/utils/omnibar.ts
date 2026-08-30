export interface OmnibarBookmarkSource {
  url: string;
  title: string;
  boardTitle?: string;
}

export interface OmnibarBoardSource {
  url: string;
  name: string;
  boardTitle?: string;
}

export interface OmnibarHistorySource {
  url: string;
  title: string;
  boardTitle?: string;
  viewedDate?: number;
}

export type OmnibarSource = "bookmark" | "history" | "board" | "direct";

export interface OmnibarMergedEntry {
  url: string;
  title: string;
  boardTitle: string;
  isBookmark: boolean;
  sources: OmnibarSource[];
  historyRank: number | null;
  viewedDate: number;
}

export interface OmnibarSuggestion {
  url: string;
  title: string;
  boardTitle: string;
  score: number;
  isBookmark: boolean;
  sources: OmnibarSource[];
  actionLabel?: string;
}

const MAX_HISTORY_RECENCY_BOOST = 120;
const HISTORY_RECENCY_STEP = 2;

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function calcTextScore(query: string, title: string, url: string, boardTitle: string): number {
  if (!query) {
    return 0;
  }

  const normalizedTitle = title.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  const normalizedBoardTitle = boardTitle.toLowerCase();

  let score = 0;

  if (normalizedTitle.startsWith(query)) {
    score += 90;
  } else if (normalizedTitle.includes(query)) {
    score += 60;
  }

  if (normalizedUrl.startsWith(query)) {
    score += 55;
  } else if (normalizedUrl.includes(query)) {
    score += 35;
  }

  if (normalizedBoardTitle.includes(query)) {
    score += 24;
  }

  return score;
}

function calcMatchLength(query: string, title: string, url: string, boardTitle: string): number {
  if (!query) {
    return Number.POSITIVE_INFINITY;
  }

  const candidates = [title, url, boardTitle];
  let shortest = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (normalized.includes(query) && normalized.length < shortest) {
      shortest = normalized.length;
    }
  }

  return shortest;
}

function calcRecencyBoost(historyRank: number | null): number {
  if (historyRank === null) {
    return 0;
  }

  return Math.max(0, MAX_HISTORY_RECENCY_BOOST - historyRank * HISTORY_RECENCY_STEP);
}

function addSource(entry: OmnibarMergedEntry, source: OmnibarSource): void {
  if (!entry.sources.includes(source)) {
    entry.sources.push(source);
  }
}

export function mergeOmnibarSources(
  bookmarks: readonly OmnibarBookmarkSource[],
  historyEntries: readonly OmnibarHistorySource[],
  boardSources: readonly OmnibarBoardSource[] = [],
): OmnibarMergedEntry[] {
  const byUrl = new Map<string, OmnibarMergedEntry>();

  for (const [index, item] of historyEntries.entries()) {
    const url = normalizeString(item.url);
    if (!url) {
      continue;
    }

    const title = normalizeString(item.title, url);
    const boardTitle = normalizeString(item.boardTitle);
    const viewedDate = Math.max(0, Math.trunc(toFiniteNumber(item.viewedDate)));

    const existing = byUrl.get(url);
    if (!existing) {
      byUrl.set(url, {
        url,
        title,
        boardTitle,
        isBookmark: false,
        sources: ["history"],
        historyRank: index,
        viewedDate,
      });
      continue;
    }

    addSource(existing, "history");

    if (existing.historyRank === null || index < existing.historyRank) {
      existing.historyRank = index;
    }

    if (viewedDate > existing.viewedDate) {
      existing.viewedDate = viewedDate;
    }

    if (!existing.title && title) {
      existing.title = title;
    }

    if (!existing.boardTitle && boardTitle) {
      existing.boardTitle = boardTitle;
    }
  }

  for (const bookmark of bookmarks) {
    const url = normalizeString(bookmark.url);
    if (!url) {
      continue;
    }

    const title = normalizeString(bookmark.title, url);
    const boardTitle = normalizeString(bookmark.boardTitle);

    const existing = byUrl.get(url);
    if (!existing) {
      byUrl.set(url, {
        url,
        title,
        boardTitle,
        isBookmark: true,
        sources: ["bookmark"],
        historyRank: null,
        viewedDate: 0,
      });
      continue;
    }

    existing.isBookmark = true;
    addSource(existing, "bookmark");

    // 変更理由: お気に入りは利用者が明示的に残した意図が強いため、
    // 履歴由来タイトルよりブックマーク名を優先して候補ラベルを安定させる。
    if (title) {
      existing.title = title;
    }

    if (!existing.boardTitle && boardTitle) {
      existing.boardTitle = boardTitle;
    }
  }

  // bbsmenuの板をエントリに追加（履歴・ブックマークに同URLがある場合は上書きしない）
  for (const board of boardSources) {
    const url = normalizeString(board.url);
    if (!url) {
      continue;
    }

    const existing = byUrl.get(url);
    if (existing) {
      // 変更理由: 同じURLが複数ソースに現れても候補は1件にまとめ、
      // 由来だけを複数アイコンで示して重複表示と情報欠落を同時に防ぐ。
      addSource(existing, "board");
      if (!existing.boardTitle && board.boardTitle) {
        existing.boardTitle = normalizeString(board.boardTitle);
      }
      continue;
    }

    byUrl.set(url, {
      url,
      title: normalizeString(board.name, url),
      boardTitle: normalizeString(board.boardTitle),
      isBookmark: false,
      sources: ["board"],
      historyRank: null,
      viewedDate: 0,
    });
  }

  return [...byUrl.values()];
}

export function buildOmnibarSuggestions(
  entries: readonly OmnibarMergedEntry[],
  rawQuery: string,
  limit: number,
): OmnibarSuggestion[] {
  const query = normalizeQuery(rawQuery);

  const ranked = entries
    .map((entry) => {
      const textScore = calcTextScore(query, entry.title, entry.url, entry.boardTitle);

      if (query && textScore === 0) {
        return null;
      }

      const bookmarkBoost = entry.isBookmark ? 140 : 0;
      const recencyBoost = calcRecencyBoost(entry.historyRank);
      const matchLength = calcMatchLength(query, entry.title, entry.url, entry.boardTitle);

      return {
        url: entry.url,
        title: entry.title,
        boardTitle: entry.boardTitle,
        isBookmark: entry.isBookmark,
        sources: entry.sources,
        score: textScore + bookmarkBoost + recencyBoost,
        matchLength,
        viewedDate: entry.viewedDate,
      };
    })
    .filter(
      (
        suggestion,
      ): suggestion is OmnibarSuggestion & {
        matchLength: number;
        viewedDate: number;
      } => suggestion !== null,
    )
    .sort((a, b) => {
      // 最短一致（マッチしたタイトル/URL/板名が短いもの）を優先する
      if (a.matchLength !== b.matchLength) {
        return a.matchLength - b.matchLength;
      }

      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.viewedDate !== a.viewedDate) {
        return b.viewedDate - a.viewedDate;
      }

      return a.url.localeCompare(b.url, "ja");
    });

  return ranked
    .slice(0, limit)
    .map(({ viewedDate: _viewedDate, matchLength: _matchLength, ...rest }) => rest);
}
