import { ChURL } from "../url/ChURL";

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:/i;

export interface ParsedBBSMenuBoard {
  name: string;
  url: string;
}

export interface ParsedBBSMenuCategory {
  name: string;
  boards: ParsedBBSMenuBoard[];
}

export interface ParsedBBSMenu {
  name: string;
  categories: ParsedBBSMenuCategory[];
}

/** bbsmenu内の相対URLを取得元URL基準の絶対URLへ解決する。 */
function resolveBoardUrl(rawUrl: string, menuUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  const isAbsoluteUrl = ABSOLUTE_URL_PATTERN.test(trimmedUrl);
  const isRelativePath =
    trimmedUrl.startsWith("/") ||
    trimmedUrl.startsWith("./") ||
    trimmedUrl.startsWith("../") ||
    trimmedUrl.includes("/");

  // URL APIは単語も有効な相対URLにするため、破損したbbsmenu値を正常化しない。
  if (!isAbsoluteUrl && !isRelativePath) return trimmedUrl;

  try {
    return new globalThis.URL(trimmedUrl, menuUrl).href;
  } catch {
    return trimmedUrl;
  }
}

/** bbsmenu HTMLの解析と、利用者指定の除外TLD適用を行う。 */
export class BBSMenuHtmlParser {
  static parseExcludeOptions(optionStr: string): Set<string> {
    const result = new Set<string>();
    for (const option of optionStr.split("\n")) {
      if (option === "" || option.startsWith("//")) continue;
      try {
        result.add(new ChURL(option).getTsld() || option);
      } catch {
        result.add(option);
      }
    }
    return result;
  }

  static parse(html: string, menuUrl: string, excludeTslds: Set<string>): ParsedBBSMenu {
    const menu = this.rawParse(html, menuUrl);
    if (!menu.name) {
      try {
        menu.name = new globalThis.URL(menuUrl).hostname;
      } catch {
        menu.name = menuUrl;
      }
    }

    menu.categories = menu.categories
      .map((category) => ({
        ...category,
        boards: category.boards.filter((board) => {
          try {
            const tsld = new ChURL(board.url).getTsld();
            // bbspinkは利用者の除外設定があってもメニューに残す仕様を維持する。
            return !excludeTslds.has(tsld) || tsld === "bbspink.com";
          } catch {
            return true;
          }
        }),
      }))
      .filter((category) => category.boards.length > 0);

    return menu;
  }

  private static rawParse(html: string, menuUrl: string): ParsedBBSMenu {
    const lines = html.split(/\r?\n/);
    const menu: ParsedBBSMenu = { name: "", categories: [] };
    let currentCategory: ParsedBBSMenuCategory | null = null;

    const titleMatch = html.match(/<TITLE>(.*?)<\/TITLE>/i);
    if (titleMatch?.[1]) menu.name = this.decodeHtmlEntities(titleMatch[1].trim());

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const categoryMatch = trimmedLine.match(/<BR><BR><B>(.*?)<\/B><BR>/i);
      if (categoryMatch?.[1]) {
        currentCategory = { name: this.decodeHtmlEntities(categoryMatch[1].trim()), boards: [] };
        menu.categories.push(currentCategory);
        continue;
      }

      if (!currentCategory) continue;
      const boardMatch = trimmedLine.match(/<A HREF=(.*?)>(.*?)<\/A>/i);
      if (!boardMatch?.[1] || !boardMatch[2]) continue;

      const rawUrl = boardMatch[1].trim().replace(/^['"]|['"]$/g, "");
      const name = this.decodeHtmlEntities(boardMatch[2].trim());
      if (
        rawUrl &&
        name &&
        !rawUrl.includes("index.html") &&
        !rawUrl.endsWith("../") &&
        !name.toLowerCase().includes("top")
      ) {
        currentCategory.boards.push({ name, url: resolveBoardUrl(rawUrl, menuUrl) });
      }
    }

    menu.categories = menu.categories.filter((category) => category.boards.length > 0);
    return menu;
  }

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
