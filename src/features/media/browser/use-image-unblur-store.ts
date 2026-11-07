import { create } from "zustand";

interface ImageUnblurStoreState {
  /** 利用者が右クリックメニューでぼかしを解除した画像の鍵（本文中の元のURL）。 */
  unblurredKeys: ReadonlySet<string>;
  unblurImages: (keys: readonly string[]) => void;
}

/**
 * 語句や類似画像NGによるぼかしを、画像ごとに利用者が解除した状態を覚える。
 * ぼかしの判定はレス単位で行われるため、解除は判定の結果ではなく画像の鍵への上書きとして持つ。
 * 保存はせず、画面を開き直すと元のぼかしに戻る（誤って解除した画像が残り続けないようにする）。
 */
export const useImageUnblurStore = create<ImageUnblurStoreState>((set) => ({
  unblurredKeys: new Set(),

  unblurImages: (keys) => {
    set((state) => {
      if (keys.every((key) => state.unblurredKeys.has(key))) return state;
      return { unblurredKeys: new Set([...state.unblurredKeys, ...keys]) };
    });
  },
}));
