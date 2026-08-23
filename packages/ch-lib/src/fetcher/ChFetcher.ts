import { BBSCategory, BBSMenuParser } from "../parser/BBSMenuParser";
import { BoardParser, BoardThread } from "../parser/BoardParser";
import { ThreadData, ThreadParser } from "../parser/ThreadParser";
import { ChURL } from "../url/ChURL";
import {
  FetchHttpClient,
  HttpClient,
  HttpRequest,
  HttpResponseMetadata,
  HttpStatusError,
} from "./HttpClient";

export interface ChFetchMetadata extends HttpResponseMetadata {
  /** Number of responses parsed from this payload; a partial 206 payload reports only its slice. */
  parsedResCount?: number;
}

export interface ChFetchResult<T> {
  data: T;
  metadata: ChFetchMetadata;
}

interface DecodedText {
  text: string;
  metadata: ChFetchMetadata;
}

export class ChFetcher {
  constructor(private readonly httpClient: HttpClient = new FetchHttpClient()) {}

  private async fetchText(
    url: string,
    charset: string,
    request: HttpRequest = {},
  ): Promise<DecodedText> {
    const response = await this.httpClient.get(url, request);
    if (response.status < 200 || response.status >= 300) {
      throw new HttpStatusError(url, response.status);
    }
    const decoder = new TextDecoder(charset);
    return { text: decoder.decode(response.body), metadata: response.metadata };
  }

  async fetchBoard(urlStr: string): Promise<BoardThread[]> {
    return (await this.fetchBoardWithMetadata(urlStr)).data;
  }

  async fetchBoardWithMetadata(
    urlStr: string,
    request: HttpRequest = {},
  ): Promise<ChFetchResult<BoardThread[]>> {
    const chUrl = new ChURL(urlStr);
    const subjectUrl = chUrl.getSubjectUrl();
    if (!subjectUrl) throw new Error("Invalid board URL");

    let charset = "shift_jis";
    if (chUrl.getTsld() === "shitaraba.net") {
      charset = "euc-jp";
    }

    const result = await this.fetchText(subjectUrl, charset, request);
    return { data: BoardParser.parse(chUrl, result.text), metadata: result.metadata };
  }

  async fetchThread(urlStr: string): Promise<ThreadData> {
    return (await this.fetchThreadWithMetadata(urlStr)).data;
  }

  async fetchThreadWithMetadata(
    urlStr: string,
    request: HttpRequest = {},
  ): Promise<ChFetchResult<ThreadData>> {
    const chUrl = new ChURL(urlStr);
    const datUrl = chUrl.getDatUrl();
    if (!datUrl) throw new Error("Invalid thread URL");

    let charset = "shift_jis";
    if (chUrl.getTsld() === "shitaraba.net") {
      charset = "euc-jp";
    }

    const result = await this.fetchText(datUrl, charset, request);
    const data = ThreadParser.parse(chUrl, result.text);
    return {
      data,
      metadata: { ...result.metadata, parsedResCount: data.posts.length },
    };
  }

  async fetchBBSMenu(url: string): Promise<BBSCategory[]> {
    const result = await this.fetchText(url, "shift_jis");
    return BBSMenuParser.parse(result.text);
  }
}
