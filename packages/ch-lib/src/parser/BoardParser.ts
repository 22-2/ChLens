import { ChURL } from "../url/ChURL";
import { decodeCharReference } from "../utils/entities";

export interface BoardThread {
  url: string;
  title: string;
  resCount: number;
  createdAt: number;
}

export class BoardParser {
  static parse(chUrl: ChURL, text: string): BoardThread[] {
    let baseUrl: string;
    let reg: RegExp;
    const pathname = chUrl.url.pathname;
    const tmp = /^\/(\w+)(?:\/(\w+)|\/?)/.exec(pathname);
    if (!tmp) return [];

    switch (chUrl.getTsld()) {
      case "machi.to":
        reg = /^\d+<>(\d+)<>(.+)\((\d+)\)$/gm;
        baseUrl = `${chUrl.url.origin}/bbs/read.cgi/${tmp[1]}/`;
        break;
      case "shitaraba.net":
        reg = /^(\d+)\.cgi,(.+)\((\d+)\)$/gm;
        baseUrl = `${chUrl.url.protocol}//jbbs.shitaraba.net/bbs/read.cgi/${tmp[1]}/${tmp[2]}/`;
        break;
      default:
        reg = /^(\d+)\.dat<>(.+) \((\d+)\)$/gm;
        baseUrl = `${chUrl.url.origin}/test/read.cgi/${tmp[1]}/`;
    }

    const threads: BoardThread[] = [];
    let regRes: RegExpExecArray | null;
    while ((regRes = reg.exec(text))) {
      let title = decodeCharReference(regRes[2]);
      // Remove "Needless from title" logic can be added later if needed or kept simple
      title = title.replace(/ ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©||&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g, "");

      const resCount = parseInt(regRes[3], 10);

      threads.push({
        url: baseUrl + regRes[1] + "/",
        title,
        resCount,
        createdAt: parseInt(regRes[1], 10) * 1000,
      });
    }

    if (chUrl.getTsld() === "shitaraba.net") {
      threads.pop(); // Remove the last empty line/footer for shitaraba
    }

    return threads;
  }
}
