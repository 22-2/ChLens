import {
  isTargetContentScriptUrl,
  normalizeContentScriptTargetUrl,
} from "src/content-scripts/url-targets";
import {
  classifyWriteResult,
  isWriteResultPageUrl,
  type WriteResultMessage,
} from "src/view/browser/utils/write-result";
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

type ViewerTargets = {
  targetUrl: string;
  viewerUrl: string;
};

function getWritePageText(): string {
  const texts = [document.title];
  const bodyText = document.body?.innerText ?? document.documentElement.textContent ?? "";
  if (bodyText !== "") {
    texts.push(bodyText);
  }

  const fontText = Array.from(
    document.getElementsByTagName("font"),
    (font) => font.textContent ?? "",
  ).join("\n");
  if (fontText !== "") {
    texts.push(fontText);
  }

  return texts.join("\n");
}

function getRefreshContent(): string | undefined {
  const meta = Array.from(document.getElementsByTagName("meta")).find(
    (element) => element.httpEquiv?.toLowerCase() === "refresh",
  );
  return meta?.getAttribute("content") ?? undefined;
}

function postWriteResult(message: WriteResultMessage): void {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(message, "*");
}

function notifyWriteResult(): void {
  const result = classifyWriteResult({
    url: window.location.href,
    title: document.title,
    bodyText: getWritePageText(),
    refreshContent: getRefreshContent(),
  });
  if (result == null) {
    return;
  }

  if (result.type === "confirm") {
    // 変更理由: 確認ページはユーザー操作の余地を残す必要があるので、
    // 即通知せず少し待ってから親へ状態を返す。
    window.setTimeout(() => {
      postWriteResult(result);
    }, WRITE_RESULT_CONFIRM_DELAY_MS);
    return;
  }

  postWriteResult(result);
}

export function createViewerTargets(currentUrl: string): ViewerTargets {
  // 変更理由: 左クリックは background へ元ページURL、補助クリックは拡張ページURLを使うため、
  // 同じ正規化済みURLから両方を組み立てて取り違えを防ぐ。
  const targetUrl = normalizeContentScriptTargetUrl(currentUrl);
  const baseUrl = browser.runtime.getURL("/view/index.html");
  return {
    targetUrl,
    viewerUrl: `${baseUrl}?q=${encodeURIComponent(targetUrl)}`,
  };
}

function openViewerInNewTab(targetUrl: string): void {
  // 変更理由: background 側は受け取ったURLを index.html?q=... に包み直すので、
  // ここで拡張ページURLを渡すと二重ラップになり目的のページを開けなくなる。
  // open-in-new-viewer-tab を使うことで、既存ビューアータブがある場合は
  // そのタブを上書きせず新しい専ブラタブとして開く。
  void browser.runtime.sendMessage({
    type: "open-in-new-viewer-tab",
    url: targetUrl,
  });
}

function createButton(id: string, text: string, additionalStyles = ""): HTMLSpanElement {
  const button = document.createElement("span");
  button.id = id;
  button.textContent = text;
  button.style.cssText = STYLES.clickable + additionalStyles;
  return button;
}

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText = STYLES.container;

  const openButton = createButton(BUTTON_IDS.open, "chlens で開く", STYLES.underline);
  const closeButton = createButton(BUTTON_IDS.close, " x", STYLES.closeButton);

  container.appendChild(openButton);
  container.appendChild(closeButton);

  return container;
}

function openLink(url: string, button: 0 | 1 | 2, ctrlKey: boolean, shiftKey: boolean): void {
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
      openViewerInNewTab(viewerTargets.targetUrl);
      return;
    }

    openLink(viewerTargets.viewerUrl, event.button as 0 | 1 | 2, event.ctrlKey, event.shiftKey);
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

  // 同一フレームに複数回インジェクトされた場合にボタンとリスナーが重複するのを防ぐ
  if (document.getElementById(BUTTON_IDS.open)) {
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
