import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { HttpClient, HttpRequestOptions, HttpResponse } from "src/app/platform/types";

function extractCharset(mimeType: string): string | null {
  const match = /charset=([^\s;]+)/i.exec(mimeType);
  return match ? match[1] : null;
}

// webviewのXHRはCORSに制限されるため、Rust側でHTTPリクエストを行うプラグインを使用する
export const TauriHttpClient: HttpClient = {
  async fetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const safeOptions = options.headers
      ? {
          ...options,
          headers: Object.fromEntries(
            Object.entries(options.headers).map(([key, value]) => [
              key,
              key.toLowerCase() === "authorization" ? "[redacted]" : value,
            ]),
          ),
        }
      : options;
    // ImgurのBearer tokenなどの秘密情報をTauriのデバッグログへ出さない。
    console.log(`[TauriHttpClient] Fetching: ${url}`, safeOptions);

    const response = await tauriFetch(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
    });

    console.log(`[TauriHttpClient] Response status: ${response.status}`);

    const headers: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      headers[key] = value;
    });

    // XHRのoverrideMimeTypeと同様に、mimeTypeのcharsetを優先してデコードする
    const charset = options.mimeType ? extractCharset(options.mimeType) : null;
    let body: string;

    try {
      if (charset) {
        // Shift_JISなどのレガシーエンコーディングをサポート
        console.log(`[TauriHttpClient] Decoding with charset: ${charset}`);
        body = new TextDecoder(charset).decode(await response.arrayBuffer());
      } else {
        body = await response.text();
      }
      console.log(`[TauriHttpClient] Body length: ${body.length}`);
    } catch (e) {
      console.error(`[TauriHttpClient] Failed to decode response with charset ${charset}:`, e);
      // フォールバック: UTF-8として読み込む
      body = await response.text();
    }

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
