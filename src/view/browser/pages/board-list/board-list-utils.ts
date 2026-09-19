import { getBoardUrlKey, normalizeBoardUrl } from "src/core/BoardUrlNormalizer";

export interface OpenedBoardEntry {
  url: string;
  title?: string;
}

/**
 * ボード URL を正規化して比較可能な形にする
 * 異なる入力形式でも同じボードを識別できるようにする
 */
export function normalizeBoardUrlForRemove(url: string): string {
  const normalizedBoardUrl = normalizeBoardUrl(url);
  if (normalizedBoardUrl !== null) {
    return normalizedBoardUrl;
  }

  try {
    return new window.URL(url).href;
  } catch {
    return url;
  }
}

/**
 * メニュー名とカテゴリ名から一意のカテゴリIDを生成
 */
export function buildCategoryId(menuName: string, categoryName: string): string {
  return `${menuName}:${categoryName}`;
}

/**
 * JSON文字列から OpenedBoardEntry 配列をパース
 * 破損データや不正な形式は安全に無視する
 */
export function parseOpenedBoardEntries(raw: string | null): OpenedBoardEntry[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<{
      url?: unknown;
      title?: unknown;
    }>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed
      .map((entry): OpenedBoardEntry | null => {
        if (!entry || typeof entry.url !== "string") {
          return null;
        }

        // 変更理由: 過去に外部サイトを板URLとして保存していたデータがあるため、
        // 「一度開いた板」へは掲示板として判定できるURLだけを残す。
        const normalizedUrl = normalizeBoardUrl(entry.url, { requireCompatibleHost: true });
        if (!normalizedUrl) {
          return null;
        }

        const normalizedEntry: OpenedBoardEntry = { url: normalizedUrl };
        if (typeof entry.title === "string") {
          normalizedEntry.title = entry.title;
        }
        return normalizedEntry;
      })
      .filter((entry): entry is OpenedBoardEntry => entry !== null);

    const uniqueEntries: OpenedBoardEntry[] = [];
    const indexByBoardKey = new Map<string, number>();
    for (const entry of entries) {
      const boardKey = getBoardUrlKey(entry.url, { requireCompatibleHost: true });
      if (boardKey === null) {
        continue;
      }

      const existingIndex = indexByBoardKey.get(boardKey);
      if (existingIndex === undefined) {
        indexByBoardKey.set(boardKey, uniqueEntries.length);
        uniqueEntries.push(entry);
        continue;
      }

      // 重複レコードのうち後ろにだけ板名がある場合は、その名前を引き継ぐ。
      if (!uniqueEntries[existingIndex].title && entry.title) {
        uniqueEntries[existingIndex] = { ...uniqueEntries[existingIndex], title: entry.title };
      }
    }

    return uniqueEntries;
  } catch {
    return [];
  }
}

/**
 * OpenedBoardEntry から表示用のタイトルを導出
 */
export function deriveOpenedBoardTitle(entry: OpenedBoardEntry): string {
  if (entry.title && entry.title.trim() !== "") {
    return entry.title;
  }

  return entry.url;
}
