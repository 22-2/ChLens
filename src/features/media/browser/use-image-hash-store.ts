import { createLogger } from "src/app/logger";
import { create } from "zustand";

import { computeImageHashFromElement } from "./image-hash-reader";

const logger = createLogger("media");

export type ImageHashEntry =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly hash: string }
  | { readonly status: "error" };

// スレを長く開いていても増え続けないよう、古いものから捨てる。捨てた画像は次に表示したとき計算し直す。
const MAX_IMAGE_HASH_ENTRIES = 2000;

interface ImageHashStoreState {
  /** 類似画像NGのルールがあり、ハッシュを計算する必要があるか。ngの機能が切り替える。 */
  hashingEnabled: boolean;
  /** 画像のURL（data-image-key）ごとのハッシュ。判定結果ではなくハッシュを持ち、ルールが変わっても使い回す。 */
  entries: ReadonlyMap<string, ImageHashEntry>;
  setHashingEnabled: (enabled: boolean) => void;
  /** 読み込み済みの画像のハッシュ計算を依頼する。計算中・計算済みなら何もしない。 */
  requestHash: (key: string, image: HTMLImageElement) => void;
  /**
   * 画像を表示できなかったことを記録する。読み込めない画像はonLoadが来ず、判定待ちのまま残るため。
   * 表示できない画像は伏せる必要がないので、計算に失敗した画像と同じ扱いにする。
   */
  markImageUnavailable: (key: string) => void;
  /**
   * 計算済みならそのハッシュを、なければその場で計算して返す（類似画像NGへの登録用）。
   * 登録はルールがまだない状態でも行うため、hashingEnabled に関係なく計算する。
   */
  getOrComputeHash: (key: string, image: HTMLImageElement) => Promise<string>;
}

function withEntry(
  entries: ReadonlyMap<string, ImageHashEntry>,
  key: string,
  entry: ImageHashEntry,
): Map<string, ImageHashEntry> {
  const next = new Map(entries);
  // 入れ直して挿入順の末尾へ移し、最近使ったものを残す。
  next.delete(key);
  next.set(key, entry);
  while (next.size > MAX_IMAGE_HASH_ENTRIES) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

/** スレッド・ポップアップなど複数の表示面で、同じ画像のハッシュを共有する。 */
export const useImageHashStore = create<ImageHashStoreState>((set, get) => ({
  hashingEnabled: false,
  entries: new Map(),

  setHashingEnabled: (enabled) => {
    if (get().hashingEnabled !== enabled) set({ hashingEnabled: enabled });
  },

  requestHash: (key, image) => {
    if (!get().hashingEnabled) return;
    const current = get().entries.get(key)?.status;
    // 失敗した画像は、次に読み込み直したときにもう一度試す（一時的な通信エラーで判定されなくなるのを避ける）。
    if (current === "pending" || current === "ready") return;
    // 読み込みが終わっていない画像は描けないため、onLoadで改めて依頼される。
    if (!image.complete || image.naturalWidth === 0) return;

    set((state) => ({ entries: withEntry(state.entries, key, { status: "pending" }) }));
    void computeImageHashFromElement(image).then(
      (hash) => {
        set((state) => ({ entries: withEntry(state.entries, key, { status: "ready", hash }) }));
      },
      (error: unknown) => {
        logger.error("類似画像NGのハッシュを計算できませんでした", {
          url: key,
          renderedSrc: image.currentSrc || image.src,
          error,
        });
        set((state) => ({ entries: withEntry(state.entries, key, { status: "error" }) }));
      },
    );
  },

  markImageUnavailable: (key) => {
    if (!get().hashingEnabled) return;
    const current = get().entries.get(key)?.status;
    if (current === "ready" || current === "error") return;
    // 読み込みの失敗はExternalImage側で扱うため、ここではログを重ねて出さない。
    set((state) => ({ entries: withEntry(state.entries, key, { status: "error" }) }));
  },

  getOrComputeHash: async (key, image) => {
    const current = get().entries.get(key);
    if (current?.status === "ready") return current.hash;
    // 失敗は呼び出し側（登録の操作）が利用者へ伝えるため、ここでは状態を変えずに投げ直す。
    const hash = await computeImageHashFromElement(image);
    set((state) => ({ entries: withEntry(state.entries, key, { status: "ready", hash }) }));
    return hash;
  },
}));

/**
 * 類似画像NGの判定が終わるまで、画像を伏せておく必要があるか。
 * 計算に失敗した画像は伏せない（NG判定のために普通の画像まで見えなくするのを避ける）。
 */
export function isImageHashPending(
  hashingEnabled: boolean,
  entry: ImageHashEntry | undefined,
): boolean {
  if (!hashingEnabled) return false;
  return entry?.status !== "ready" && entry?.status !== "error";
}
