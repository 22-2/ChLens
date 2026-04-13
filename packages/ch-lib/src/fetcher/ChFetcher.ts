import { BBSCategory, BBSMenuParser } from "../parser/BBSMenuParser";
import { BoardParser, BoardThread } from "../parser/BoardParser";
import { ThreadData, ThreadParser } from "../parser/ThreadParser";
import { ChURL } from "../url/ChURL";

export class ChFetcher {
  private async fetchText(url: string, charset: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder(charset);
    return decoder.decode(buffer);
  }

  async fetchBoard(urlStr: string): Promise<BoardThread[]> {
    const chUrl = new ChURL(urlStr);
    const subjectUrl = chUrl.getSubjectUrl();
    if (!subjectUrl) throw new Error("Invalid board URL");

    let charset = "shift_jis";
    if (chUrl.getTsld() === "shitaraba.net") {
      charset = "euc-jp";
    }

    const text = await this.fetchText(subjectUrl, charset);
    return BoardParser.parse(chUrl, text);
  }

  async fetchThread(urlStr: string): Promise<ThreadData> {
    const chUrl = new ChURL(urlStr);
    const datUrl = chUrl.getDatUrl();
    if (!datUrl) throw new Error("Invalid thread URL");

    let charset = "shift_jis";
    if (chUrl.getTsld() === "shitaraba.net") {
      charset = "euc-jp";
    }

    const text = await this.fetchText(datUrl, charset);
    return ThreadParser.parse(chUrl, text);
  }

  async fetchBBSMenu(url: string): Promise<BBSCategory[]> {
    const text = await this.fetchText(url, "shift_jis");
    return BBSMenuParser.parse(text);
  }
}
