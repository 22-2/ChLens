export interface DetachedWindowOptions {
  name: string;
  features: string;
  title: string;
  shellClassName: string;
  logLabel: string;
}

export interface DetachedWindowHandle {
  window: Window;
  root: HTMLElement;
}

function copyStyles(sourceDocument: Document, targetDocument: Document): void {
  // 変更理由: PortalはDOMだけを別Documentへ移すため、表示側のスタイルも同時に複製して
  // 将来ほかのページを別窓へ移しても、呼び出し側がCSSの移送方法を意識しないようにする。
  for (const style of sourceDocument.querySelectorAll<HTMLStyleElement>("style")) {
    targetDocument.head.appendChild(style.cloneNode(true));
  }
  for (const stylesheet of sourceDocument.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]',
  )) {
    targetDocument.head.appendChild(stylesheet.cloneNode(true));
  }
}

export function createDetachedWindowRoot(
  sourceDocument: Document,
  targetWindow: Window,
  options: DetachedWindowOptions,
): HTMLElement {
  const sourceShell = sourceDocument.querySelector<HTMLElement>(".browser-shell");
  const targetDocument = targetWindow.document;
  targetDocument.head.innerHTML = "";
  targetDocument.title = options.title;
  targetDocument.head.appendChild(
    Object.assign(targetDocument.createElement("meta"), {
      charSet: "utf-8",
    }),
  );
  copyStyles(sourceDocument, targetDocument);

  targetDocument.body.innerHTML = "";
  targetDocument.body.style.margin = "0";
  targetDocument.body.style.overflow = "hidden";
  const root = targetDocument.createElement("div");
  root.className = `browser-shell ${options.shellClassName}`;
  root.dataset.theme = sourceShell?.dataset.theme ?? "light";
  targetDocument.body.appendChild(root);
  return root;
}
