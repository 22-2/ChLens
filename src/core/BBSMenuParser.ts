import {
  BBSMenuHtmlParser,
  type ParsedBBSMenu,
  type ParsedBBSMenuBoard,
  type ParsedBBSMenuCategory,
} from "packages/ch-lib/src/index";

export type Board = ParsedBBSMenuBoard;
export type BBSMenuCategory = ParsedBBSMenuCategory;
export type BBSMenu = ParsedBBSMenu;

/** 既存のBBSMenu利用箇所を保ちながら、解析規則を共有ライブラリへ委譲する。 */
export class BBSMenuParser {
  static parseExcludeOptions(optionStr: string): Set<string> {
    return BBSMenuHtmlParser.parseExcludeOptions(optionStr);
  }

  static parse(html: string, menuUrl: string, excludeTslds: Set<string>): BBSMenu {
    return BBSMenuHtmlParser.parse(html, menuUrl, excludeTslds);
  }
}
