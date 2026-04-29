import { Request } from "src/core/HTTP";
import { HttpClient, HttpRequestOptions, HttpResponse } from "src/app/platform/types";

/**
 * ブラウザ拡張機能環境用のHttpClient実装
 */
export const BrowserHttpClient: HttpClient = {
  async fetch(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    const request = new Request(options.method || "GET", url, {
      mimeType: options.mimeType,
      headers: options.headers,
      timeout: options.timeout,
    });

    const response = await request.send();

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      url: response.responseURL,
    };
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
