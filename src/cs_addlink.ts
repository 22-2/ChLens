import {
  isTargetContentScriptUrl,
  normalizeContentScriptTargetUrl,
} from "src/content-scripts/url-targets";
import browser from "webextension-polyfill";

const BUTTON_IDS = {
  open: "36e5cda5",
  close: "92a5da13",
} as const;

const STYLES = {
  container: `
    position: fixed;
    right: 10px;
    top: 60px;
    background-color: rgba(255,255,255,0.8);
    color: #000;
    border: 1px solid black;
    border-radius: 4px;
    padding: 5px;
    font-size: 14px;
    font-weight: normal;
    z-index: 255;
  `,
  clickable: "cursor: pointer;",
  underline: "text-decoration: underline;",
  closeButton: "display: inline-block; margin-left: 5px;",
} as const;

const WRITE_RESULT_CONFIRM_DELAY_MS = 6_000;

const WRITE_RESULT_URL_PATTERNS = [
  /^https?:\/\/[^/]+\/test\/bbs\.cgi(?:\?.*)?$/i,
  /^https?:\/\/jbbs\.shitaraba\.net\/bbs\/write\.cgi\/[\w-]+\/[\d-]+\/(?:\d+|new)\/?(?:\?.*)?$/i,
  /^https?:\/\/[^/]+\/bbs\/write\.cgi(?:\?.*)?$/i,
] as const;

const WRITE_SUCCESS_TEXT_PATTERN = /書き(?:こ|込)みました/;
const WRITE_CONFIRM_TEXT_PATTERN = /確認/;
const WRITE_ERROR_TEXT_PATTERN = /(?:ＥＲＲＯＲ|ERROR|スレッド作成規制中)/;

type WriteResultMessage =
  | { type: "success"; message?: number }
  | { type: "confirm" }
  | { type: "error"; message?: string };

type ViewerTargets = {
  targetUrl: string;
  viewerUrl: string;
};

function isWriteResultPageUrl(rawUrl: string): boolean {
  return WRITE_RESULT_URL_PATTERNS.some((pattern) => pattern.test(rawUrl));
}

function getWritePageText(): string {
  const texts = [document.title];
  const bodyText =
    document.body?.innerText ?? document.documentElement.textContent ?? "";
  if (bodyText !== "") {
    texts.push(bodyText);
  }

  const fontText = Array.from(document.getElementsByTagName("font"), (font) =>
    font.textContent ?? "",
  ).join("\n");
  if (fontText !== "") {
    texts.push(fontText);
  }

  return texts.join("\n");
}

function resolveSuccessDelayMs(): number | undefined {
  const meta = Array.from(document.getElementsByTagName("meta")).find(
    (element) => element.httpEquiv?.toLowerCase() === "refresh",
  );
  if (!meta) {
    return undefined;
  }

  const content = meta.getAttribute("content") ?? "";
  const matched = content.match(/^\s*(\d+(?:\.\d+)?)\s*(?:;|$)/);
  if (!matched) {
    return undefined;
  }

  const delayMs = Math.trunc(Number.parseFloat(matched[1]) * 1000);
  return Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : undefined;
}

function resolveErrorMessage(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value !== "" && WRITE_ERROR_TEXT_PATTERN.test(value));
}

function postWriteResult(message: WriteResultMessage): void {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(message, "*");
}

function notifyWriteResult(): void {
  const text = getWritePageText();

  if (WRITE_SUCCESS_TEXT_PATTERN.test(text)) {
    postWriteResult({
      type: "success",
      message: resolveSuccessDelayMs(),
    });
    return;
  }

  if (WRITE_CONFIRM_TEXT_PATTERN.test(text)) {
    // 変更理由: 確認ページはユーザー操作の余地を残す必要があるので、
    // 即通知せず少し待ってから親へ状態を返す。
    window.setTimeout(() => {
      postWriteResult({ type: "confirm" });
    }, WRITE_RESULT_CONFIRM_DELAY_MS);
    return;
  }

  if (WRITE_ERROR_TEXT_PATTERN.test(text)) {
    postWriteResult({
      type: "error",
      message: resolveErrorMessage(text),
    });
  }
}

export function createViewerTargets(currentUrl: string): ViewerTargets {
  // 変更理由: 左クリックは background へ元ページURL、補助クリックは拡張ページURLを使うため、
  // 同じ正規化済みURLから両方を組み立てて取り違えを防ぐ。
  const targetUrl = normalizeContentScriptTargetUrl(currentUrl);
  const baseUrl = browser.runtime.getURL("/view/browser.html");
  return {
    targetUrl,
    viewerUrl: `${baseUrl}?q=${encodeURIComponent(targetUrl)}`,
  };
}

function openViewerFromCurrentTab(targetUrl: string): void {
  // 変更理由: background 側は受け取ったURLを browser.html?q=... に包み直すので、
  // ここで拡張ページURLを渡すと二重ラップになり目的のページを開けなくなる。
  void browser.runtime.sendMessage({
    type: "open-new-ui",
    url: targetUrl,
  });
}

function createButton(
  id: string,
  text: string,
  additionalStyles = "",
): HTMLSpanElement {
  const button = document.createElement("span");
  button.id = id;
  button.textContent = text;
  button.style.cssText = STYLES.clickable + additionalStyles;
  return button;
}

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText = STYLES.container;

  const openButton = createButton(
    BUTTON_IDS.open,
    "chlens で開く",
    STYLES.underline,
  );
  const closeButton = createButton(BUTTON_IDS.close, " x", STYLES.closeButton);

  container.appendChild(openButton);
  container.appendChild(closeButton);

  return container;
}

function openLink(
  url: string,
  button: 0 | 1 | 2,
  ctrlKey: boolean,
  shiftKey: boolean,
): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.dispatchEvent(new MouseEvent("click", { button, ctrlKey, shiftKey }));
}

function handleMouseDown(event: MouseEvent, viewerTargets: ViewerTargets): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.id === BUTTON_IDS.open) {
    if (event.button === 0 && !event.ctrlKey && !event.shiftKey) {
      openViewerFromCurrentTab(viewerTargets.targetUrl);
      return;
    }

    openLink(
      viewerTargets.viewerUrl,
      event.button as 0 | 1 | 2,
      event.ctrlKey,
      event.shiftKey,
    );
    return;
  }

  if (target.id === BUTTON_IDS.close) {
    const parent = target.parentElement;
    if (parent && parent.parentElement) {
      parent.parentElement.removeChild(parent);
    }
  }
}

function init(): void {
  const currentUrl = window.location.href;

  if (isWriteResultPageUrl(currentUrl)) {
    notifyWriteResult();
    return;
  }

  if (!isTargetContentScriptUrl(currentUrl)) {
    return;
  }

  const viewerTargets = createViewerTargets(currentUrl);
  const container = createContainer();

  document.body.addEventListener("mousedown", (event) => {
    handleMouseDown(event, viewerTargets);
  });

  document.body.appendChild(container);
}

init();
