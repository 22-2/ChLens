import {
  ChFetcher,
  createHttpResponseMetadata,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from "@chlen/ch-lib";
import {
  createChLensLiveSource,
  type ChLensLiveSource,
} from "../../../../apps/chlens-live/src/live-session/source";
import { CHLENS_STORYBOOK_THREAD_PROXY_PATH } from "../../../../.storybook/thread-proxy-path.ts";

class StorybookProxyHttpClient implements HttpClient {
  async get(url: string, request: HttpRequest = {}): Promise<HttpResponse> {
    const proxyUrl = `${CHLENS_STORYBOOK_THREAD_PROXY_PATH}?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, {
      headers: request.headers,
      signal: request.signal,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const body = await response.arrayBuffer();
    return {
      status: response.status,
      headers,
      body,
      metadata: createHttpResponseMetadata(headers, body),
    };
  }
}

/**
 * StorybookではブラウザのCORS制約を避けるため、ChFetcherだけを中継対応clientへ差し替える。
 * URL正規化・文字コード変換・スレッド解析・Liveのsource境界はTauri版と同じ実装を通る。
 */
export function createChLensStorybookSource(): ChLensLiveSource {
  return createChLensLiveSource(new ChFetcher(new StorybookProxyHttpClient()));
}
