import { create } from "zustand";

export type MediaImageStatus =
  | "checking"
  | "awaiting-confirmation"
  | "requested"
  | "loaded"
  | "discarded";

export type MediaImageWarningReason = "oversized" | "unknown-size";

export interface MediaImageState {
  status: MediaImageStatus;
  version: number;
  fallbackSrc: string | null;
  sourceUrl?: string;
  contentLength?: number | null;
  maxBytes?: number;
  warningReason?: MediaImageWarningReason;
}

interface MediaImageStoreState {
  images: ReadonlyMap<string, MediaImageState>;
  beginImageCheck: (key: string, sourceUrl: string) => number | null;
  requestImage: (key: string, sourceUrl?: string) => number;
  setImagePreflightResult: (
    key: string,
    sourceUrl: string,
    version: number,
    contentLength: number | null,
    maxBytes: number,
  ) => boolean;
  approveImage: (key: string, version: number) => boolean;
  markImageLoaded: (key: string, version: number) => void;
  setFallbackSrc: (key: string, version: number, fallbackSrc: string) => boolean;
  discardImage: (key: string) => boolean;
}

/** スレッド・ポップアップなど複数の表示面で同じ画像取得状態を共有する。 */
export const useMediaImageStore = create<MediaImageStoreState>((set, get) => ({
  images: new Map(),

  beginImageCheck: (key, sourceUrl) => {
    const current = get().images.get(key);
    if (current && current.sourceUrl === sourceUrl && current.status !== "discarded") return null;

    const image: MediaImageState = {
      status: "checking",
      version: (current?.version ?? 0) + 1,
      fallbackSrc: null,
      sourceUrl,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return image.version;
  },

  requestImage: (key, sourceUrl) => {
    const current = get().images.get(key);
    if (current && current.status !== "discarded" && current.sourceUrl === sourceUrl) {
      return current.version;
    }

    const image: MediaImageState = {
      status: "requested",
      version: (current?.version ?? 0) + 1,
      fallbackSrc: null,
      sourceUrl,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return image.version;
  },

  setImagePreflightResult: (key, sourceUrl, version, contentLength, maxBytes) => {
    const current = get().images.get(key);
    if (
      current?.status !== "checking" ||
      current.version !== version ||
      current.sourceUrl !== sourceUrl
    ) {
      return false;
    }

    const isWithinLimit = contentLength != null && contentLength <= maxBytes;
    const image: MediaImageState = {
      status: isWithinLimit ? "requested" : "awaiting-confirmation",
      version,
      fallbackSrc: null,
      sourceUrl,
      contentLength,
      maxBytes,
      warningReason: isWithinLimit
        ? undefined
        : contentLength == null
          ? "unknown-size"
          : "oversized",
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return true;
  },

  approveImage: (key, version) => {
    const current = get().images.get(key);
    if (current?.status !== "awaiting-confirmation" || current.version !== version) return false;

    set((state) => ({
      images: new Map(state.images).set(key, {
        ...current,
        status: "requested",
      }),
    }));
    return true;
  },

  markImageLoaded: (key, version) => {
    const current = get().images.get(key);
    if (current?.status === "discarded") return;
    if (current && current.version !== version) return;
    if (!current && version !== 0) return;

    const image: MediaImageState = {
      ...current,
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
      ...current,
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
      sourceUrl: current.sourceUrl,
    };
    set((state) => ({ images: new Map(state.images).set(key, image) }));
    return true;
  },
}));
