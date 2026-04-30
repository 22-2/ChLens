import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { HttpClient, HttpRequestOptions, HttpResponse } from "src/app/platform/types";

// webviewのXHRはCORSに制限されるため、Rust側でHTTPリクエストを行うプラグインを使用する
export const TauriHttpClient: HttpClient = {
  async fetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const response = await tauriFetch(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
    });

    const headers: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });

    const body = await response.text();

    return {
      status: response.status,
      headers,
      body,
      url: response.url,
    };
  },

  async setupWriteHeaders(_formAction: string): Promise<void> {
    // Tauri環境ではdeclarativeNetRequestが使えないため、
    // 将来的にRust側でリクエストヘッダを操作する実装に置き換える
  },
};
