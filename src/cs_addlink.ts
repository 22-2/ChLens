import {
  isTargetContentScriptUrl,
  normalizeContentScriptTargetUrl,
} from "src/content-scripts/url-targets";

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

type BrowserApiLike = {
  runtime: {
    getURL: (path: string) => string;
  };
};

function getBrowserApi(): BrowserApiLike {
  const maybeBrowser = (globalThis as { browser?: BrowserApiLike }).browser;
  if (maybeBrowser) {
    return maybeBrowser;
  }

  return (globalThis as { chrome: BrowserApiLike }).chrome;
}

function createViewerUrl(currentUrl: string): string {
  const baseUrl = getBrowserApi().runtime.getURL("/view/index.html");
  const normalizedUrl = normalizeContentScriptTargetUrl(currentUrl);
  return `${baseUrl}?q=${encodeURIComponent(normalizedUrl)}`;
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

  const openButton = createButton(BUTTON_IDS.open, "read.crx 2 で開く", STYLES.underline);
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

function handleMouseDown(event: MouseEvent, viewerUrl: string): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.id === BUTTON_IDS.open) {
    openLink(viewerUrl, event.button as 0 | 1 | 2, event.ctrlKey, event.shiftKey);
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
