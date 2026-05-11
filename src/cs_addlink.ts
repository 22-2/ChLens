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

function createViewerUrl(currentUrl: string): string {
  // 変更理由: この導線は旧ビューではなく new-ui を開くためのものなので、
  // 入口を browser.html に揃えて遷移先を統一する。
  const baseUrl = browser.runtime.getURL("/view/browser.html");
  const normalizedUrl = normalizeContentScriptTargetUrl(currentUrl);
  return `${baseUrl}?q=${encodeURIComponent(normalizedUrl)}`;
}

function openViewerFromCurrentTab(currentUrl: string): void {
  // 変更理由: 左クリック時は background 側に current tab の URL を渡し、
  // 既存の new-ui があればそれを再利用して「今のタブ」を開く。
  void browser.runtime.sendMessage({
    type: "open-new-ui",
    url: currentUrl,
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

function handleMouseDown(event: MouseEvent, viewerUrl: string): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.id === BUTTON_IDS.open) {
    if (event.button === 0 && !event.ctrlKey && !event.shiftKey) {
      openViewerFromCurrentTab(viewerUrl);
      return;
    }

    openLink(
      viewerUrl,
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
  if (!isTargetContentScriptUrl(window.location.href)) {
    return;
  }

  const viewerUrl = createViewerUrl(window.location.href);
  const container = createContainer();

  document.body.addEventListener("mousedown", (event) => {
    handleMouseDown(event, viewerUrl);
  });

  document.body.appendChild(container);
}

init();
