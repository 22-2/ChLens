import { BBSCategory, BBSMenuParser } from "../parser/BBSMenuParser";
import { BoardParser, BoardThread } from "../parser/BoardParser";
import { ThreadData, ThreadParser } from "../parser/ThreadParser";
import { ChURL } from "../url/ChURL";
import { FetchHttpClient, HttpClient, HttpStatusError } from "./HttpClient";

export class ChFetcher {
  constructor(private readonly httpClient: HttpClient = new FetchHttpClient()) {}

  private async fetchText(url: string, charset: string): Promise<string> {
    const response = await this.httpClient.get(url);
    if (response.status < 200 || response.status >= 300) {
      throw new HttpStatusError(url, response.status);
    }
    const decoder = new TextDecoder(charset);
    return decoder.decode(response.body);
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
