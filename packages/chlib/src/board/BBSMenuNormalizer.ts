import { getBoardUrlKey, normalizeBoardUrl } from "../url/boardIdentity";

export interface NormalizableBoard {
  name: string;
  url: string;
  subjectVerified?: true;
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
 * 板URLの正規化規則だけに依存する純粋処理なので、アプリ側からchlibへ移した。
 */
export function normalizeBBSMenus<T extends NormalizableBBSMenu>(menus: T[]): T[] {
  const seenBoardKeys = new Set<string>();

  return menus
    .map((menu) => {
      const categories = menu.categories
        .map((category) => {
          const boards: NormalizableBoard[] = [];
          // 旧履歴の外部サイトは除きつつ、取得確認済みの独自ホストは再起動後も残す。
          const requireCompatibleHost = menu.name === "その他" || menu.name === "Other";
          for (const board of category.boards) {
            const options = {
              requireCompatibleHost,
              subjectVerified: board.subjectVerified === true,
            };
            const normalizedUrl = normalizeBoardUrl(board.url, options);
            const boardKey = getBoardUrlKey(board.url, options);
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
