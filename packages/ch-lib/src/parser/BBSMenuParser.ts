import { ChURL } from "../url/ChURL";

export interface BBSBoard {
  title: string;
  url: string;
}

export interface BBSCategory {
  title: string;
  boards: BBSBoard[];
}

export interface BBSMenuParserOptions {
  excludeTslds?: Set<string>;
  bbspinkException?: boolean;
}

export class BBSMenuParser {
  static parse(html: string, options: BBSMenuParserOptions = {}): BBSCategory[] {
    const categories: BBSCategory[] = [];
    // `<br>` starts with the same letter as `<b>`; require a tag boundary so line breaks do not
    // prematurely end a category and drop every board after the first one.
    const regCategory = /<b[^>]*>(.+?)<\/b>\s*(?:<br>)?\s*(<a\s[\s\S]+?)(?=<b(?:\s|>)|$)/gi;
    const regBoard = /<a\shref="?((?:https?:)?\/\/[\w.-]+\/(\w+)\/)"?>(.+?)<\/a>/gi;

    let catMatch: RegExpExecArray | null;
    while ((catMatch = regCategory.exec(html))) {
      const categoryTitle = this.stripHtmlTags(catMatch[1]);
      const categoryHtml = catMatch[0];
      const boards: BBSBoard[] = [];
      let subName: string | null = null;

      let boardMatch: RegExpExecArray | null;
      while ((boardMatch = regBoard.exec(categoryHtml))) {
        let boardUrl = boardMatch[1];
        if (boardUrl.startsWith("//")) {
          boardUrl = `https:${boardUrl}`;
        }

        const chUrlObj = new ChURL(boardUrl);
        const tsld = chUrlObj.getTsld();

        if (options.excludeTslds?.has(tsld)) {
          continue;
        }

        if (options.bbspinkException && boardUrl.includes("5ch.io/bbypink")) {
          continue;
        }

        if (subName === null) {
          if (boardUrl.includes("open2ch.net")) {
            subName = "op";
          } else if (boardUrl.includes("2ch.sc")) {
            subName = "sc";
          } else {
            subName = "";
          }
        }

        let boardTitle = this.stripHtmlTags(boardMatch[3]);
        if (
          subName !== "" &&
          !(boardTitle.endsWith(`(${subName})`) || boardTitle.endsWith(`_${subName}`))
        ) {
          boardTitle += `_${subName}`;
        }

        boards.push({
          url: boardUrl,
          title: boardTitle,
        });
      }

      if (boards.length > 0) {
        let finalCategoryTitle = categoryTitle;
        if (
          subName &&
          subName !== "" &&
          !(
            finalCategoryTitle.endsWith(`(${subName})`) ||
            finalCategoryTitle.endsWith(`_${subName}`)
          )
        ) {
          finalCategoryTitle += `(${subName})`;
        }

        categories.push({
          title: finalCategoryTitle,
          boards,
        });
      }
    }

    return categories;
  }

  private static stripHtmlTags(text: string): string {
    return text
      .replace(/<br\s*\/?>/gi, "")
      .replace(/<\/?[^>]+>/g, "")
      .trim();
  }
}
