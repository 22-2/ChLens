import { ChURL, HOSTNAME, isCompatibleBoardHost } from "packages/ch-lib/src/index";

export interface BoardUrlNormalizationOptions {
  /** 開いた板の記録など、既知の掲示板ホストだけに限定する場合に指定する。 */
  requireCompatibleHost?: boolean;
}

/**
 * 板URLを、掲示板の種別と板パスを基準にした表示用URLへ正規化する。
 *
 * 変更理由: URL文字列をそのまま比較すると、http/httpsや末尾スラッシュ、
 * Eddibbの旧形式が別の板として扱われ、同じ板が一覧に複数表示されるため。
 */
export function normalizeBoardUrl(
  rawUrl: string,
  options: BoardUrlNormalizationOptions = {},
): string | null {
  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl === "") {
    return null;
  }

  try {
    const inputUrl = new window.URL(trimmedUrl);
    const parsed = new ChURL(trimmedUrl);
    let boardUrl =
      parsed.type === "thread" ? parsed.toBoard().url : parsed.type === "board" ? parsed.url : null;

    // ChURLの古い板パターンは板名のハイフンを許容しないため、
    // 既知ホストに限って板パスの形だけを補完する。
    if (boardUrl === null && isCompatibleBoardHost(inputUrl.hostname)) {
      const path = inputUrl.pathname;
      const isSingleSegmentBoard = /^\/(?:subback\/|test\/-\/)?[\w-]+\/?$/u.test(path);
      const isShitarabaBoard =
        inputUrl.hostname.endsWith(".shitaraba.net") && /^\/[\w-]+\/[\w-]+\/?$/u.test(path);
      if (isSingleSegmentBoard || isShitarabaBoard) {
        boardUrl = inputUrl;
      }
    }

    if (boardUrl === null) {
      return null;
    }

    const normalized = new window.URL(boardUrl.href);
    normalized.hostname = normalized.hostname.toLowerCase();
    normalized.search = "";
    normalized.hash = "";

    // 5chの既読情報はサーバー横断検索用に *.5ch.io へ保存されるが、
    // ワイルドカードは実在する板ホストではないため一覧へ表示しない。
    if (normalized.hostname.includes("*") || normalized.hostname.includes("%")) {
      return null;
    }

    if (options.requireCompatibleHost && !isCompatibleBoardHost(normalized.hostname)) {
      return null;
    }

    // EddibBは旧形式(/test/read.cgi/板/)と通常形式(/板/)が混在するため、
    // 板URLの比較時だけ通常形式へ寄せて同一板として扱う。
    if (normalized.hostname === HOSTNAME.EDDIBB) {
      const match = /^\/test\/read\.cgi\/([\w-]+)\/?$/i.exec(normalized.pathname);
      if (match) {
        normalized.pathname = `/${match[1]}/`;
      }
    }

    if (!normalized.pathname.endsWith("/")) {
      normalized.pathname += "/";
    }

    return normalized.href;
  } catch {
    return null;
  }
}

/**
 * 板URLをプロトコルに依存しない比較キーへ変換する。
 * 表示用URLはhttpsを優先するなどの別判断を残しつつ、重複判定だけを安定させる。
 */
export function getBoardUrlKey(
  rawUrl: string,
  options: BoardUrlNormalizationOptions = {},
): string | null {
  const normalizedUrl = normalizeBoardUrl(rawUrl, options);
  if (normalizedUrl === null) {
    return null;
  }

  try {
    const parsed = new window.URL(normalizedUrl);
    return `${parsed.host.toLowerCase()}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export interface NormalizableBoard {
  name: string;
  url: string;
}

export interface NormalizableBBSMenu {
  name: string;
  categories: Array<{
    name: string;
    boards: NormalizableBoard[];
  }>;
}

/**
 * 取得済みBBSMENUを、最初に現れたメニュー・カテゴリを優先して正規化する。
 *
 * 変更理由: 複数のBBSMENUを併用すると同じ板が別メニューへ重複登録されるため、
 * 取得元ごとのキャッシュではなく、表示直前の全体で一度だけ重複排除する。
 */
export function normalizeBBSMenus<T extends NormalizableBBSMenu>(menus: T[]): T[] {
  const seenBoardKeys = new Set<string>();

  return menus
    .map((menu) => {
      const categories = menu.categories
        .map((category) => {
          const boards: NormalizableBoard[] = [];
          // 「その他」は履歴由来のため、既知の掲示板ホストに限定して
          // 過去に混入したTwitterやDiscordなどをキャッシュからも掃除する。
          const requireCompatibleHost = menu.name === "その他" || menu.name === "Other";
          for (const board of category.boards) {
            const normalizedUrl = normalizeBoardUrl(board.url, { requireCompatibleHost });
            const boardKey = getBoardUrlKey(board.url, { requireCompatibleHost });
            if (normalizedUrl === null || boardKey === null || seenBoardKeys.has(boardKey)) {
              continue;
            }

            seenBoardKeys.add(boardKey);
            boards.push({ ...board, url: normalizedUrl });
          }
          return { ...category, boards };
        })
        .filter((category) => category.boards.length > 0);

      return { ...menu, categories };
    })
    .filter((menu) => menu.categories.length > 0) as T[];
}
