import type { Page } from "src/view/browser/types";
import { parseInternalBrowserPageStrict } from "src/view/browser/utils/link-routing";
import type browser from "webextension-polyfill";

type ExtensionBrowserApi = Pick<typeof browser, "runtime" | "tabs">;

function getExtensionBrowserApi(): ExtensionBrowserApi | null {
  const candidate = (
    globalThis as typeof globalThis & {
      browser?: ExtensionBrowserApi;
    }
  ).browser;

  // 変更理由: Tauri では互換シムが runtime.id を提供するものの tabs.query は使えないため、
  // API の存在まで確認して拡張機能専用コマンドを確実に隠す。
  if (
    !candidate ||
    candidate.runtime.id === "tauri" ||
    typeof candidate.tabs.query !== "function"
  ) {
    return null;
  }

  return candidate;
}

export function canQueryExtensionTabs(): boolean {
  return getExtensionBrowserApi() != null;
}

export async function getOpenCompatibleThreadPages(): Promise<
  Array<Extract<Page, { type: "thread" }>>
> {
  const browserApi = getExtensionBrowserApi();
  if (!browserApi) return [];

  const openTabs = await browserApi.tabs.query({});
  const pagesByUrl = new Map<string, Extract<Page, { type: "thread" }>>();

  for (const tab of openTabs) {
    if (typeof tab.url !== "string") continue;

    const page = parseInternalBrowserPageStrict(tab.url);
    if (page?.type !== "thread" || pagesByUrl.has(page.threadUrl)) continue;

    pagesByUrl.set(page.threadUrl, {
      ...page,
      title: tab.title?.trim() || page.title,
    });
  }

  return [...pagesByUrl.values()];
}
