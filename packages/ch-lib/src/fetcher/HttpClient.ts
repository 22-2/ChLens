export interface HttpRequest {
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

export interface HttpContentRange {
  start: number;
  end: number;
  total?: number;
}

export interface HttpResponseMetadata {
  etag?: string;
  lastModified?: string;
  contentLength?: number;
  contentRange?: HttpContentRange;
  bodyBytes: number;
}

export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: ArrayBuffer;
  metadata: HttpResponseMetadata;
}

function getHeader(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName);
  return entry?.[1];
}

export function createHttpResponseMetadata(
  headers: Readonly<Record<string, string>>,
  body: ArrayBuffer,
): HttpResponseMetadata {
  const contentLengthValue = getHeader(headers, "content-length");
  const contentLength = contentLengthValue === undefined ? undefined : Number(contentLengthValue);
  const contentRangeValue = getHeader(headers, "content-range");
  const rangeMatch = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRangeValue ?? "");

  return {
    etag: getHeader(headers, "etag"),
    lastModified: getHeader(headers, "last-modified"),
    contentLength:
      contentLength !== undefined && Number.isFinite(contentLength) && contentLength >= 0
        ? contentLength
        : undefined,
    contentRange: rangeMatch
      ? {
          start: Number(rangeMatch[1]),
          end: Number(rangeMatch[2]),
          total: rangeMatch[3] === "*" ? undefined : Number(rangeMatch[3]),
        }
      : undefined,
    bodyBytes: body.byteLength,
  };
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

    const body = await response.arrayBuffer();
    return {
      status: response.status,
      headers,
      body,
      metadata: createHttpResponseMetadata(headers, body),
    };
  }
}
