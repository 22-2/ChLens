import { parseBBSMenu, BBSMenu } from "src/core/parseBBSMenu";
import { URL } from "src/core/URL";

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
    const menu = parseBBSMenu(html);

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
}
