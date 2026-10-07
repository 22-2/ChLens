import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PopupPortalLayerProps {
  host: HTMLElement | null;
  children: React.ReactNode;
}

export const PopupPortalLayer: React.FC<PopupPortalLayerProps> = ({ host, children }) => {
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!host) {
      setPortalRoot(null);
      return;
    }

    // popup 群の mount を Portal に閉じ込めても既存の absolute 座標系を維持するため、
    // まずは thread-page 直下に portal root を挿して責務だけ先に分離する。
    // 変更理由: hostが別窓のDocumentに属する場合、元窓のdocumentで要素を生成すると
    // Portal先と要素のownerDocumentが分かれ、スタイル・イベント境界が不整合になるため。
    const nextPortalRoot = host.ownerDocument.createElement("div");
    nextPortalRoot.className = "thread-page__popup-layer";
    nextPortalRoot.dataset.popupPortalLayer = "true";
    host.appendChild(nextPortalRoot);
    setPortalRoot(nextPortalRoot);

    return () => {
      setPortalRoot((current) => (current === nextPortalRoot ? null : current));
      nextPortalRoot.remove();
    };
  }, [host]);

  if (!portalRoot) {
    return null;
  }

  return createPortal(children, portalRoot);
};
