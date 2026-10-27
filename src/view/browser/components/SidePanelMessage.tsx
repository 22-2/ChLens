import type { ReactNode } from "react";

/** サイドパネルのビューで、表示する内容がない理由や読み込み中を伝える。 */
export function SidePanelMessage({ children }: { children: ReactNode }) {
  return <p className="side-panel__empty">{children}</p>;
}
