import type { BBSMenu } from "src/core/BBSMenuParser";

export interface OpenedBoardEntry {
  url: string;
  title?: string;
}

/**
 * ボード URL を正規化して比較可能な形にする
 * 異なる入力形式でも同じボードを識別できるようにする
 */
export function normalizeBoardUrlForRemove(url: string): string {
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

    return parsed
      .map((entry) => {
        if (!entry || typeof entry.url !== "string") {
          return null;
        }

        const normalizedUrl = normalizeBoardUrlForRemove(entry.url);
        if (!normalizedUrl) {
          return null;
        }

        return {
          url: normalizedUrl,
          title: typeof entry.title === "string" ? entry.title : undefined,
        } satisfies OpenedBoardEntry;
      })
      .filter((entry): entry is OpenedBoardEntry => entry !== null);
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
