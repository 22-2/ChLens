import { useContext } from "react";
import {
  type DetachedTabController,
  DetachedTabControllerContext,
} from "src/view/browser/hooks/detached-tab-controller";

export type { DetachedTabController } from "src/view/browser/hooks/detached-tab-controller";

/**
 * 別窓の状態だけを読む軽量な入口。
 *
 * 変更理由: ContentAreaや下部パネルは別窓のページ実装を読み込む必要がないため、
 * platformやTabPanelを含む重いホストからContextを切り離し、拡張APIなしのテストや
 * 埋め込み画面でも同じ表示部品を読み込めるようにする。
 */
export function useDetachedTabController(): DetachedTabController {
  return useContext(DetachedTabControllerContext);
}
