import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  createHttpResponseMetadata,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from "@chlen/ch-lib";

/**
 * HTTP transport for the Tauri runtime.
 *
 * The Live WebView is subject to browser CORS rules, so network access stays in the Rust-side
 * `tauri-plugin-http` client while this adapter preserves raw response bytes for ch-lib decode.
 */
export class TauriHttpClient implements HttpClient {
  async get(url: string, request: HttpRequest = {}): Promise<HttpResponse> {
    try {
      const response = await tauriFetch(url, {
        method: "GET",
        headers: request.headers ? { ...request.headers } : undefined,
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
    } catch (error) {
      console.error(`[TauriHttpClient] GET failed: ${url}`, error);
      throw error;
    }
  }
}
