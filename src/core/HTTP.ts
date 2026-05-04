import { platform } from "src/app";
import { createLogger } from "src/core/logger";

const logger = createLogger("HTTP");

type headerList = Record<string, string>;

export class Request {
  readonly method: string;
  readonly url: string;
  readonly mimeType: string | null;
  readonly timeout: number;
  readonly headers: headerList;
  readonly preventCache: boolean;

  constructor(
    method: string,
    url: string,
    {
      mimeType = null,
      headers = {},
      timeout = 30000,
      preventCache = false,
    }: Partial<{
      mimeType: string | null;
      headers: headerList;
      timeout: number;
      preventCache: boolean;
    }> = {},
  ) {
    this.method = method;
    this.url = url;

    this.mimeType = mimeType;
    this.timeout = timeout;
    this.headers = headers;
    this.preventCache = preventCache;
  }

  async send(): Promise<Response> {
    const url = this.url;

    if (this.preventCache) {
      this.headers["Pragma"] = "no-cache";
      this.headers["Cache-Control"] = "no-cache";
    }

    try {
      logger.debug(`Sending HTTP request: ${this.method} ${url}`, {
        method: this.method,
        url,
        mimeType: this.mimeType,
        timeout: this.timeout,
        headers: this.headers,
      });
      const response = await platform.http.fetch(url, {
        method: this.method,
        headers: this.headers,
        mimeType: this.mimeType || undefined,
        timeout: this.timeout,
      });
      logger.debug(`Received HTTP response: ${response.status} ${url}`, {
        status: response.status,
        url,
        headers: response.headers,
      });

      return new Response(
        response.status,
        response.headers,
        response.body,
        response.url,
      );
    } catch (e) {
      logger.error(`HTTP request failed: ${this.method} ${url}`, { error: e });
      return Promise.reject(e);
    }
  }

  abort(): void {
    // XMLHttpRequestに依存していたため、platform abstractionではサポートしていません
  }

  static parseHTTPHeader(str: string): headerList {
    const reg = /^(?:([a-z\-]+):\s*|([ \t]+))(.+)\s*$/gim;
    const headers: headerList = {};
    let last: string | undefined;
    let res: RegExpExecArray | null;

    while ((res = reg.exec(str))) {
      if (typeof res[1] !== "undefined") {
        headers[res[1]] = res[3];
        last = res[1];
      } else if (typeof last !== "undefined") {
        headers[last] += res[2] + res[3];
      }
    }

    return headers;
  }
}

export class Response {
  constructor(
    public status: number,
    public headers: headerList = {},
    public body: string,
    public responseURL: string,
  ) {}
}
