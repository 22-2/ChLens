import { create } from "zustand";

export type MediaImageStatus = "requested" | "loaded" | "discarded";

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
  discardImage: (key: string) => boolean;
}

/** スレッド・ポップアップなど複数の表示面で同じ画像取得状態を共有する。 */
export const useMediaImageStore = create<MediaImageStoreState>((set, get) => ({
  images: new Map(),

  requestImage: (key) => {
    const current = get().images.get(key);
    if (current && current.status !== "discarded") return current.version;

    const image: MediaImageState = {
      status: "requested",
      version: (current?.version ?? 0) + 1,
      fallbackSrc: null,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return image.version;
  },

  markImageLoaded: (key, version) => {
    const current = get().images.get(key);
    if (current?.status === "discarded") return;
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
    if (current?.status === "discarded") return false;
    if ((current && current.version !== version) || (!current && version !== 0)) return false;

    const image: MediaImageState = {
      status: current?.status ?? "requested",
      version,
      fallbackSrc,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return true;
  },

  discardImage: (key) => {
    const current = get().images.get(key);
    if (!current || current.status !== "loaded") return false;

    if (current.fallbackSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(current.fallbackSrc);
    }

    const image: MediaImageState = {
      status: "discarded",
      version: current.version + 1,
      fallbackSrc: null,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return true;
  },
}));
