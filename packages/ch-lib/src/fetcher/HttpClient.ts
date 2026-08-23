export interface HttpRequest {
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: ArrayBuffer;
}

/**
 * Transport boundary for board resources.
 *
 * Keeping this contract below ChFetcher lets browser fetch, Tauri HTTP, and fixture transports
 * share the same URL, charset, and parser behavior without importing a platform API here.
 */
export interface HttpClient {
  get(url: string, request?: HttpRequest): Promise<HttpResponse>;
}

export class HttpStatusError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`HTTP request failed (${status}): ${url}`);
    this.name = "HttpStatusError";
  }
}

export class FetchHttpClient implements HttpClient {
  async get(url: string, request: HttpRequest = {}): Promise<HttpResponse> {
    const response = await fetch(url, {
      headers: request.headers,
      signal: request.signal,
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      headers,
      body: await response.arrayBuffer(),
    };
  }
}
