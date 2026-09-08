import React from "react";
import { ChURL } from "packages/ch-lib/src/url/ChURL";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import type { IThread } from "src/service-container/interfaces";
import type { ColumnDef } from "src/view/browser/components/SimpleDataTable";
import type { ResolvedTheme } from "src/view/browser/hooks/use-theme";

const UI_CACHE_STORE = "UICache";
const threadListCacheKey = (boardUrl: string) => `threadList:${boardUrl}`;

// 変更理由: 通常ページと下部パネルは別マウントになるため、一覧を共有のIDBキャッシュから
// 復元し、通信中も直前の表示を維持してページ切替時のちらつきを抑える。
export async function getThreadListCache(boardUrl: string): Promise<IThread[] | null> {
  try {
    // platform はブラウザ用 polyfill を読み込むため、一覧パネルを実際に使う時だけ遅延読込する。
    // これにより書き込みパネルだけを使うテスト・起動経路へ不要な拡張API依存を持ち込まない。
    const { platform } = await import("src/app");
    const store = platform.storage.getStore(UI_CACHE_STORE);
    const entry = (await store.get(threadListCacheKey(boardUrl))) as
      | { url: string; data: IThread[] }
      | undefined;
    return entry?.data ?? null;
  } catch (error) {
    console.error("[ThreadListShared] cache read failed:", error);
    return null;
  }
}

export async function setThreadListCache(boardUrl: string, threads: IThread[]): Promise<void> {
  try {
    const { platform } = await import("src/app");
    const store = platform.storage.getStore(UI_CACHE_STORE);
    await store.put({ url: threadListCacheKey(boardUrl), data: threads });
  } catch (error) {
    console.error("[ThreadListShared] cache save failed:", error);
  }
}

export type ThreadListSortColumn = "num" | "title" | "resCount" | "unreadCount" | "heat";
export type ThreadListSortDirection = "asc" | "desc";
export type ThreadListSortPreference = {
  column: ThreadListSortColumn | null;
  direction: ThreadListSortDirection;
};

const THREAD_LIST_SORT_STORAGE_KEY = "chlens_browser_thread_list_sort_by_site";
export const THREAD_LIST_COLUMN_VISIBILITY_STORAGE_KEY =
  "chlens_browser_thread_list_columns_visibility";
export const THREAD_LIST_COLUMN_VISIBILITY_LOCKED_KEYS = ["title"] as const;
const DEFAULT_THREAD_LIST_SORT: ThreadListSortPreference = { column: null, direction: "asc" };

const BG_COLOR_PRESETS: Record<string, string> = {
  yellow: "#ffeb3b",
  blue: "#e3f2fd",
  green: "#c8e6c9",
  red: "#ffcdd2",
  purple: "#e1bee7",
  orange: "#ffe0b2",
  pink: "#f8bbd0",
  cyan: "#b2ebf2",
  lime: "#f0f4c3",
  amber: "#ffecb3",
};

type Rgb = { r: number; g: number; b: number };
export type HighlightRowStyle = React.CSSProperties & {
  "--thread-list-highlight-bg"?: string;
  "--thread-list-highlight-hover-bg"?: string;
};
export type DividerStyle = React.CSSProperties & {
  "--data-table-divider-accent"?: string;
};

function parseColorToRgb(rawColor: string): Rgb | null {
  const color = rawColor.trim();
  const shortHex = color.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((char) => `${char}${char}`);
    return {
      r: Number.parseInt(r, 16),
      g: Number.parseInt(g, 16),
      b: Number.parseInt(b, 16),
    };
  }

  const longHex = color.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    return {
      r: Number.parseInt(longHex[1].slice(0, 2), 16),
      g: Number.parseInt(longHex[1].slice(2, 4), 16),
      b: Number.parseInt(longHex[1].slice(4, 6), 16),
    };
  }

  const rgb = color.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgb) {
    return {
      r: Number.parseInt(rgb[1], 10),
      g: Number.parseInt(rgb[2], 10),
      b: Number.parseInt(rgb[3], 10),
    };
  }

  return null;
}

function blendRgb(base: Rgb, overlay: Rgb, alpha: number): string {
  const blendChannel = (baseChannel: number, overlayChannel: number) =>
    Math.round(baseChannel * (1 - alpha) + overlayChannel * alpha);
  return `rgb(${blendChannel(base.r, overlay.r)}, ${blendChannel(base.g, overlay.g)}, ${blendChannel(base.b, overlay.b)})`;
}

function resolveHighlightColor(bgColor: string): string {
  return BG_COLOR_PRESETS[bgColor] ?? bgColor;
}

export function createHighlightRowStyle(bgColor: string, theme: ResolvedTheme): HighlightRowStyle {
  const resolvedBackground = resolveHighlightColor(bgColor);
  const parsed = parseColorToRgb(resolvedBackground);
  if (!parsed) return { "--thread-list-highlight-bg": resolvedBackground };

  const overlay =
    theme === "dark"
      ? { color: { r: 255, g: 255, b: 255 }, alpha: 0.3 }
      : { color: { r: 0, g: 0, b: 0 }, alpha: 0.16 };
  return {
    "--thread-list-highlight-bg": resolvedBackground,
    "--thread-list-highlight-hover-bg": blendRgb(parsed, overlay.color, overlay.alpha),
  };
}

export function createHighlightDividerStyle(bgColor: string): DividerStyle {
  return { "--data-table-divider-accent": resolveHighlightColor(bgColor) };
}

export function isSortColumn(value: string): value is ThreadListSortColumn {
  return (
    value === "num" ||
    value === "title" ||
    value === "resCount" ||
    value === "unreadCount" ||
    value === "heat"
  );
}

export function isSortDirection(value: string): value is ThreadListSortDirection {
  return value === "asc" || value === "desc";
}

function resolveThreadListSortSiteKey(boardUrl: string): string {
  try {
    const tsld = new ChURL(boardUrl).getTsld();
    if (tsld) return tsld;
  } catch {
    // URL 正規化に失敗しても hostname fallback で設定を分離できるようにする。
  }
  try {
    return new window.URL(boardUrl).hostname.toLowerCase();
  } catch {
    return boardUrl;
  }
}

export function readThreadListSortPreference(boardUrl: string): ThreadListSortPreference {
  try {
    const raw = getStore2String(THREAD_LIST_SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_THREAD_LIST_SORT;
    const stored = JSON.parse(raw) as Record<string, Partial<ThreadListSortPreference> | undefined>;
    const preference = stored[resolveThreadListSortSiteKey(boardUrl)];
    const direction = preference?.direction ?? "";
    if (preference?.column === null) return DEFAULT_THREAD_LIST_SORT;
    if (preference?.column && isSortColumn(preference.column) && isSortDirection(direction)) {
      return { column: preference.column, direction };
    }
  } catch (error) {
    console.error("[ThreadListShared] sort preference read failed:", error);
  }
  return DEFAULT_THREAD_LIST_SORT;
}

export function writeThreadListSortPreference(
  boardUrl: string,
  preference: ThreadListSortPreference,
): void {
  try {
    const raw = getStore2String(THREAD_LIST_SORT_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Record<string, ThreadListSortPreference>) : {};
    stored[resolveThreadListSortSiteKey(boardUrl)] = preference;
    void setStore2String(THREAD_LIST_SORT_STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.error("[ThreadListShared] sort preference save failed:", error);
  }
}

export function calcHeat(now: number, created: number, resCount: number): string {
  if (!Number.isFinite(created) || created > now) return "0.0";
  const elapsed = Math.max((now - created) / 1000, 1) / (24 * 60 * 60);
  return (resCount / elapsed).toFixed(1);
}

export type DisplayThread = {
  thread: IThread;
  originalIndex: number;
  unreadCount: number;
  heat: number;
};

export const THREAD_LIST_COLUMNS: ColumnDef<DisplayThread>[] = [
  {
    key: "num",
    header: "No.",
    headerClassName: "thread-list__th--num",
    cellClassName: "thread-list__num",
    sortable: true,
    cell: ({ originalIndex }) => originalIndex,
  },
  {
    key: "title",
    header: "タイトル",
    headerClassName: "thread-list__th--title",
    cellClassName: "thread-list__title",
    sortable: true,
    cell: ({ thread }) => {
      const label = thread.highlight?.params?.label;
      return (
        <>
          {thread.title}
          {label && <span className="thread-list__label">{label}</span>}
        </>
      );
    },
  },
  {
    key: "resCount",
    header: "レス",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: ({ thread }) => thread.resCount,
  },
  {
    key: "unreadCount",
    header: "未読",
    headerClassName: "thread-list__th--count",
    cellClassName: "thread-list__count",
    sortable: true,
    cell: ({ unreadCount }) => (unreadCount > 0 ? unreadCount : ""),
  },
  {
    key: "heat",
    header: "勢い",
    headerClassName: "thread-list__th--heat",
    cellClassName: "thread-list__heat",
    sortable: true,
    cell: ({ heat }) => heat.toFixed(1),
  },
];
