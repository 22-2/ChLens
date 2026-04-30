import { HttpClient, HttpRequestOptions, HttpResponse } from "src/app/platform/types";

function parseHTTPHeader(str: string): Record<string, string> {
  const reg = /^(?:([a-z\-]+):\s*|([ \t]+))(.+)\s*$/gim;
  const headers: Record<string, string> = {};
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

/**
 * ブラウザ拡張機能環境用のHttpClient実装
 */
export const BrowserHttpClient: HttpClient = {
  async fetch(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method || "GET", url);

      if (options.mimeType) {
        xhr.overrideMimeType(options.mimeType);
      }

      if (options.timeout) {
        xhr.timeout = options.timeout;
      }

      if (options.headers) {
        for (const [key, val] of Object.entries(options.headers)) {
          xhr.setRequestHeader(key, val);
        }
      }

      xhr.onloadend = () => {
        const responseHeaders = parseHTTPHeader(xhr.getAllResponseHeaders());
        resolve({
          status: xhr.status,
          headers: responseHeaders,
          body: xhr.responseText,
          url: xhr.responseURL,
        });
      };

      xhr.ontimeout = () => reject("timeout");
      xhr.onabort = () => reject("abort");
      xhr.onerror = () => reject("error");

      xhr.send(options.body);
    });
  },

  async setupWriteHeaders(formAction: string): Promise<void> {
    const api = typeof browser !== "undefined" ? browser : chrome;

    if (!api?.declarativeNetRequest?.updateSessionRules) {
      console.warn("declarativeNetRequest is not available");
      return;
    }

    try {
      const tab = await api.tabs.getCurrent();
      if (!tab?.id) return;

      const existing = await new Promise<chrome.declarativeNetRequest.Rule[]>(
        (resolve) => {
          api.declarativeNetRequest.getSessionRules((rules) =>
            resolve(rules as chrome.declarativeNetRequest.Rule[]),
          );
        },
      );

      const oldRule = existing.find(
        (r) => (r as any).condition?.urlFilter === formAction,
      );
      const actionOrigin = new URL(formAction).origin;

      const rule: chrome.declarativeNetRequest.Rule = {
        id: oldRule ? oldRule.id : existing.length + 1,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "Origin", operation: "set", value: actionOrigin },
            { header: "Referer", operation: "set", value: formAction },
          ],
        },
        condition: {
          tabIds: [tab.id],
          urlFilter: formAction,
          requestMethods: ["post"],
          resourceTypes: ["sub_frame"],
        },
      };

      await api.declarativeNetRequest.updateSessionRules({
        addRules: [rule],
        removeRuleIds: oldRule ? [oldRule.id] : [],
      });
    } catch (e) {
      console.error("setupWriteHeaders failed:", e);
    }
  },
};
