import { createLogger } from "src/app/logger";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

const logger = createLogger("media");

/** 画像の右クリックメニューを開いた時点の対象。 */
export interface ImageMenuContext {
  /** 画像の鍵（本文中の元のURL。data-image-key と同じ）。 */
  imageKey: string;
  /** 読み込み済みの画像要素。ハッシュの計算などに使う。 */
  image: HTMLImageElement;
  /** メニューを開いた窓。確認や通知はこの窓に出す。 */
  targetWindow: Window;
}

/** メニューを開くたびに呼ばれ、追加する項目を返す。 */
export type ImageMenuProvider = (context: ImageMenuContext) => ContextMenuItem[];

const providers = new Set<ImageMenuProvider>();

/**
 * 画像の右クリックメニュー（サムネイルとビューア）へ、ほかの機能が項目を足す入口。
 * media が ng などの機能を import せずに済むよう、項目は登録された関数から受け取る
 * （拡張ポイント計画の「開くたびに呼ばれる関数」と同じ形。docs/plans/extension-points-plan.md §3.1）。
 * 戻り値を呼ぶと登録を解除する。
 */
export function addImageMenuProvider(provider: ImageMenuProvider): () => void {
  providers.add(provider);
  return () => {
    providers.delete(provider);
  };
}

/** 登録された関数から、メニューに足す項目を集める。1つが失敗しても、ほかの項目とメニューは出す。 */
export function collectImageMenuItems(context: ImageMenuContext): ContextMenuItem[] {
  return [...providers].flatMap((provider) => {
    try {
      return provider(context);
    } catch (error) {
      logger.error("画像の右クリックメニューの項目を作れませんでした", {
        imageKey: context.imageKey,
        error,
      });
      return [];
    }
  });
}
