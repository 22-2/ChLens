import { create } from "zustand";

export type MediaImageStatus = "requested" | "loaded";

export interface MediaImageState {
  status: MediaImageStatus;
  version: number;
  fallbackSrc: string | null;
}

interface MediaImageStoreState {
  images: ReadonlyMap<string, MediaImageState>;
  requestImage: (key: string) => number;
  markImageLoaded: (key: string, version: number) => void;
  setFallbackSrc: (key: string, version: number, fallbackSrc: string) => boolean;
}

/** スレッド・ポップアップなど複数の表示面で同じ画像取得状態を共有する。 */
export const useMediaImageStore = create<MediaImageStoreState>((set, get) => ({
  images: new Map(),

  requestImage: (key) => {
    const current = get().images.get(key);
    if (current) return current.version;

    const image: MediaImageState = {
      status: "requested",
      version: 1,
      fallbackSrc: null,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return image.version;
  },

  markImageLoaded: (key, version) => {
    const current = get().images.get(key);
    if (current && current.version !== version) return;
    if (!current && version !== 0) return;

    const image: MediaImageState = {
      status: "loaded",
      version,
      fallbackSrc: current?.fallbackSrc ?? null,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
  },

  setFallbackSrc: (key, version, fallbackSrc) => {
    const current = get().images.get(key);
    if ((current && current.version !== version) || (!current && version !== 0)) return false;

    const image: MediaImageState = {
      status: current?.status ?? "requested",
      version,
      fallbackSrc,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return true;
  },
}));
