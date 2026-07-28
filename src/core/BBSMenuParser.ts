import { URL } from "src/core/URL";

export interface Board {
  name: string;
  url: string;
}

export interface BBSMenuCategory {
  name: string;
  boards: Board[];
}

export type BBSMenu = {
  /** bbs_menu.htmlのタイトル or domain */
  name: string;
  /** カテゴリリスト */
  categories: BBSMenuCategory[];
};

/**
 * BBSMenuのHTMLパースとフィルタリングを担当する純粋ロジッククラス。
 * 外部依存（config, cache, HTTP）を持たないため単体テストが容易。
 */
export class BBSMenuParser {
  /**
   * 除外オプション文字列（改行区切り）をパースして除外TLDのSetを返す。
   * "//" で始まる行と空行はスキップする。
   */
  static parseExcludeOptions(optionStr: string): Set<string> {
    const result = new Set<string>();
    for (const opt of optionStr.split("\n")) {
      if (opt === "" || opt.startsWith("//")) continue;
      try {
        result.add(new URL(opt).getTsld() || opt);
      } catch {
        result.add(opt);
      }
    }
    return result;
  }

  /**
   * BBSMenu HTMLをパースし、除外TLDでフィルタリングしたBBSMenuを返す。
   *
   * @param html     取得したBBSMenu HTML文字列
   * @param url      取得元URL（メニュー名のフォールバックに使用）
   * @param excludeTslds 除外するTLDのSet（parseExcludeOptionsの戻り値）
   */
  static parse(html: string, url: string, excludeTslds: Set<string>): BBSMenu {
    // 内部の rawParse を使用するように変更（src/core/parseBBSMenu.ts のロジックを統合したため）
    const menu = this.rawParse(html);

    // メニュー名が無い場合はURLのホスト名をフォールバックとして使用
    if (!menu.name) {
      try {
        menu.name = new URL(url).hostname;
      } catch {
        menu.name = url;
      }
    }

    menu.categories = menu.categories
      .map((cat) => ({
        ...cat,
        boards: cat.boards.filter((board) => {
          try {
            const boardUrl = new URL(board.url);
            const tsld = boardUrl.getTsld();
            if (excludeTslds.has(tsld)) {
              // bbspink.com は除外オプションに含まれていても常に表示する（例外扱い）
              if (tsld === "bbspink.com") {
                return true;
              }
              return false;
            }
          } catch {
            // URLが不正な場合は除外しない
          }
          return true;
        }),
      }))
      .filter((cat) => cat.boards.length > 0);

    return menu;
  }

  /**
   * src/core/parseBBSMenu.ts から統合された生パースロジック。
   * HTML文字列からカテゴリと板の構造を抽出する。
   */
  private static rawParse(html: string): BBSMenu {
    const lines = html.split(/\r?\n/);
    const menu: BBSMenu = { name: "", categories: [] };
    let currentCategory: BBSMenuCategory | null = null;

    const titleRegex = /<TITLE>(.*?)<\/TITLE>/i;
    const categoryRegex = /<BR><BR><B>(.*?)<\/B><BR>/i;
    const boardRegex = /<A HREF=(.*?)>(.*?)<\/A>/i;

    const titleMatch = html.match(titleRegex);
    if (titleMatch && titleMatch[1]) {
      menu.name = this.decodeHtmlEntities(titleMatch[1].trim());
    }

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const categoryMatch = trimmedLine.match(categoryRegex);
      if (categoryMatch && categoryMatch[1]) {
        currentCategory = {
          name: this.decodeHtmlEntities(categoryMatch[1].trim()),
          boards: [],
        };
        menu.categories.push(currentCategory);
        continue;
      }

      if (currentCategory) {
        const boardMatch = trimmedLine.match(boardRegex);
        if (boardMatch && boardMatch[1] && boardMatch[2]) {
          const url = boardMatch[1].trim().replace(/^"|"$/g, ""); // クォートを除去
          const name = this.decodeHtmlEntities(boardMatch[2].trim());

          // 不要なリンクを除外
          if (
            url &&
            name &&
            !url.includes("index.html") &&
            !url.endsWith("../") &&
            !name.toLowerCase().includes("top")
          ) {
            currentCategory.boards.push({ name, url });
          }
        }
      }
    }

    // 板が空のカテゴリを除去
    menu.categories = menu.categories.filter((category) => category.boards.length > 0);

    return menu;
  }

  /**
   * HTMLエンティティをデコードする。
   */
  private static decodeHtmlEntities(text: string): string {
    return text
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }
}
