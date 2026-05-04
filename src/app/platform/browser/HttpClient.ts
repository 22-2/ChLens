import {
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "src/app/platform/types";
import browser from "webextension-polyfill";

type DnrRule = browser.DeclarativeNetRequest.Rule;
type DnrApi = NonNullable<(typeof browser)["declarativeNetRequest"]>;

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

async function getSessionRules(dnr: DnrApi): Promise<DnrRule[]> {
  const getSessionRulesFn = dnr.getSessionRules;

  if (getSessionRulesFn.length === 0) {
    return await (getSessionRulesFn as () => Promise<DnrRule[]>).call(dnr);
  }

  return await new Promise((resolve) => {
    (
      getSessionRulesFn as (callback: (rules: DnrRule[]) => void) => void
    ).call(dnr, (rules) => resolve(rules));
  });
}

function getNextRuleId(rules: DnrRule[]): number {
  const usedIds = new Set(rules.map((rule) => rule.id));
  let nextId = 1;
  while (usedIds.has(nextId)) {
    nextId += 1;
  }
  return nextId;
}

function isSameWriteRule(rule: DnrRule, formAction: string, tabId: number): boolean {
  return (
    rule.condition.urlFilter === formAction &&
    rule.condition.tabIds?.includes(tabId) === true
  );
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
      xhr.open(options.method ?? "GET", url);

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

      // onloadend は error/abort 後にも呼ばれるため、成功時だけ onload で確定させる
      xhr.onload = () => {
        const responseHeaders = parseHTTPHeader(xhr.getAllResponseHeaders());
        resolve({
          status: xhr.status,
          headers: responseHeaders,
          body: xhr.responseText,
          url: xhr.responseURL || url,
        });
      };

      xhr.ontimeout = () => reject("timeout");
      xhr.onabort = () => reject("abort");
      xhr.onerror = () => reject("error");

      xhr.send(options.body);
    });
  },

  async setupWriteHeaders(formAction: string): Promise<void> {
    const api = browser;

    if (
      !api?.declarativeNetRequest?.updateSessionRules ||
      !api.declarativeNetRequest.getSessionRules
    ) {
      console.warn("declarativeNetRequest is not available");
      return;
    }

    try {
      const tab = await api.tabs.getCurrent();
      if (!tab?.id) return;

      const dnr = api.declarativeNetRequest;
      const existing = await getSessionRules(dnr);
      const oldRule = existing.find((rule) =>
        isSameWriteRule(rule, formAction, tab.id!),
      );
      const actionOrigin = new URL(formAction).origin;

      // ルール削除でIDが欠番化しても衝突しないよう、未使用IDを探索して再利用する
      const ruleId = oldRule?.id ?? getNextRuleId(existing);

      const rule: browser.DeclarativeNetRequest.Rule = {
        id: ruleId,
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

      await dnr.updateSessionRules({
        addRules: [rule],
        removeRuleIds: oldRule ? [oldRule.id] : [],
      });
    } catch (e) {
      console.error("setupWriteHeaders failed:", e);
    }
  },
};
