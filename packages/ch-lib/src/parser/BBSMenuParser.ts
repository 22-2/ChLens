import { ChURL } from "../url/ChURL";

export interface BBSBoard {
  title: string;
  url: string;
}

export interface BBSCategory {
  title: string;
  boards: BBSBoard[];
}

export class BBSMenuParser {
  static parse(html: string): BBSCategory[] {
    const categories: BBSCategory[] = [];
    const regCategory = /<b>(.+?)<\/b>(?:.*[\r\n]+<a\s.*?>.+?<\/a>)+/gi;
    const regBoard = /<a\shref="?((?:https?:)?\/\/[\w\.]+\/(\w+)\/)"?>(.+?)<\/a>/gi;

    let catMatch: RegExpExecArray | null;
    while ((catMatch = regCategory.exec(html))) {
      const categoryTitle = catMatch[1];
      const categoryHtml = catMatch[0];
      const boards: BBSBoard[] = [];

      let boardMatch: RegExpExecArray | null;
      while ((boardMatch = regBoard.exec(categoryHtml))) {
        boards.push({
          url: boardMatch[1],
          title: boardMatch[3],
        });
      }

      if (boards.length > 0) {
        categories.push({
          title: categoryTitle,
          boards,
        });
      }
    }

    return categories;
  }
}
