import { useEffect, useMemo, useState } from "react";

export const IMGUR_ALBUM_API_URL = "https://api.imgur.com/3/album";
export const IMGUR_ALBUM_REQUEST_TIMEOUT_MS = 8_000;

// Imgurの公開読み取りAPIはClient-IDを要求するため、設定がない場合も
// 画像表示を成立させられる公開用IDを既定値として使う。ユーザー設定のIDは優先する。
export const IMGUR_DEFAULT_CLIENT_ID = "546c25a59c58ad7";

interface ImgurApiImage {
  link?: unknown;
}

interface ImgurApiResponse {
  data?: unknown;
}

export interface ImgurAlbumResolverOptions {
  fetch?: (url: string, headers: Record<string, string>) => Promise<ImgurHttpResponse>;
  getClientId?: () => string | null;
  getAccessToken?: () => string | null;
  timeoutMs?: number;
  logError?: (message: string, error?: unknown) => void;
}

export interface ImgurHttpResponse {
  status: number;
  body: string;
}

export type ImgurAlbumImageMap = ReadonlyMap<string, readonly string[]>;

function isImgurAlbumUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!["imgur.com", "www.imgur.com", "m.imgur.com"].includes(url.hostname.toLowerCase())) {
      return false;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length === 2 && parts[0].toLowerCase() === "a" && parts[1].length > 0;
  } catch {
    return false;
  }
}

function getImgurAlbumId(rawUrl: string): string | null {
  if (!isImgurAlbumUrl(rawUrl)) return null;
  const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
  return parts[1] ?? null;
}

export function normalizeImgurAlbumUrl(rawUrl: string): string | null {
  const albumId = getImgurAlbumId(rawUrl);
  return albumId ? `https://imgur.com/a/${albumId}` : null;
}

export function normalizeImgurImageUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host === "imgur.com" || host === "www.imgur.com" || host === "m.imgur.com") {
      url.hostname = "i.imgur.com";
    } else if (host !== "i.imgur.com") {
      return null;
    }

    const pathname = url.pathname.replace(/\/+$/, "");
    if (!/^\/[a-z0-9]+(?:\.[a-z0-9]+)?$/i.test(pathname)) return null;
    url.protocol = "https:";
    url.pathname = /\.[a-z0-9]+$/i.test(pathname) ? pathname : `${pathname}.png`;
    return url.href;
  } catch {
    return null;
  }
}

function getDefaultFetch(): (
  url: string,
  headers: Record<string, string>,
) => Promise<ImgurHttpResponse> {
  return async (url, headers) => {
    // ブラウザ用ポリフィルをテスト環境へ読み込まず、実際のAPI利用時だけ実行環境を解決する。
    const { platform } = await import("src/app/platform");
    const response = await platform.http.fetch(url, {
      headers,
      timeout: IMGUR_ALBUM_REQUEST_TIMEOUT_MS,
    });
    return { status: response.status, body: response.body };
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Imgur API timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function parseImageLinks(body: string): string[] {
  let payload: ImgurApiResponse;
  try {
    payload = JSON.parse(body) as ImgurApiResponse;
  } catch (error) {
    throw new Error("Imgur API returned invalid JSON", { cause: error });
  }

  if (!Array.isArray(payload.data)) {
    throw new Error("Imgur API response did not contain an image list");
  }

  return payload.data.flatMap((item: ImgurApiImage) => {
    const link = typeof item?.link === "string" ? normalizeImgurImageUrl(item.link) : null;
    return link ? [link] : [];
  });
}

export class ImgurAlbumResolver {
  private readonly fetcher: NonNullable<ImgurAlbumResolverOptions["fetch"]>;
  private readonly getClientId: ImgurAlbumResolverOptions["getClientId"];
  private readonly getAccessToken: ImgurAlbumResolverOptions["getAccessToken"];
  private readonly timeoutMs: number;
  private readonly logError: NonNullable<ImgurAlbumResolverOptions["logError"]>;
  private readonly cache = new Map<string, readonly string[]>();
  private readonly inFlight = new Map<string, Promise<readonly string[] | null>>();
  private readonly failedThreads = new Set<string>();

  constructor(options: ImgurAlbumResolverOptions = {}) {
    this.fetcher = options.fetch ?? getDefaultFetch();
    this.getClientId = options.getClientId;
    this.getAccessToken = options.getAccessToken;
    this.timeoutMs = options.timeoutMs ?? IMGUR_ALBUM_REQUEST_TIMEOUT_MS;
    this.logError = options.logError ?? ((message, error) => console.error(message, error));
  }

  async resolve(albumUrl: string, threadKey: string): Promise<readonly string[] | null> {
    const cacheKey = normalizeImgurAlbumUrl(albumUrl);
    const albumId = getImgurAlbumId(albumUrl);
    if (!cacheKey || !albumId) return null;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    if (this.failedThreads.has(threadKey)) return null;

    const inFlightKey = `${threadKey}\u0000${cacheKey}`;
    const current = this.inFlight.get(inFlightKey);
    if (current) return current;

    const request = this.fetchAlbum(albumId, threadKey, cacheKey);
    this.inFlight.set(inFlightKey, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(inFlightKey);
    }
  }

  async resolveMany(albumUrls: readonly string[], threadKey: string): Promise<ImgurAlbumImageMap> {
    const resolved = new Map<string, readonly string[]>();
    // 失敗した瞬間にスレッド全体を停止できるよう、同一スレッドの取得は直列化する。
    for (const albumUrl of albumUrls) {
      const images = await this.resolve(albumUrl, threadKey);
      if (images) resolved.set(normalizeImgurAlbumUrl(albumUrl)!, images);
      if (this.failedThreads.has(threadKey)) break;
    }
    return resolved;
  }

  private async fetchAlbum(
    albumId: string,
    threadKey: string,
    cacheKey: string,
  ): Promise<readonly string[] | null> {
    try {
      let accessToken = this.getAccessToken?.() ?? null;
      let clientId = this.getClientId?.() ?? null;
      if (!this.getAccessToken || !this.getClientId) {
        const { container } = await import("src/service-container");
        accessToken ??= container.config.get("imgur_access_token")?.trim() ?? null;
        clientId ??= container.config.get("imgur_client_id")?.trim() ?? IMGUR_DEFAULT_CLIENT_ID;
      }
      clientId ??= IMGUR_DEFAULT_CLIENT_ID;
      const authorization = accessToken
        ? `Bearer ${accessToken}`
        : clientId
          ? `Client-ID ${clientId}`
          : null;
      if (!authorization) {
        throw new Error("Imgur API authorization is not configured");
      }

      const response = await withTimeout(
        this.fetcher(`${IMGUR_ALBUM_API_URL}/${encodeURIComponent(albumId)}/images`, {
          Authorization: authorization,
        }),
        this.timeoutMs,
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Imgur API returned HTTP ${response.status}`);
      }
      const images = parseImageLinks(response.body);
      this.cache.set(cacheKey, images);
      return images;
    } catch (error) {
      this.failedThreads.add(threadKey);
      // 認証ヘッダーやレスポンス本文はログに含めず、再試行抑止の原因だけを記録する。
      this.logError(`[ImgurAlbumResolver] album resolution failed for ${cacheKey}`, error);
      return null;
    }
  }
}

export const imgurAlbumResolver = new ImgurAlbumResolver();

function createResolvedLink(doc: Document, url: string): HTMLAnchorElement {
  const link = doc.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "→ リンク";
  return link;
}

function replaceAlbumNode(doc: Document, imageUrls: readonly string[]): DocumentFragment | null {
  if (imageUrls.length === 0) return null;
  const fragment = doc.createDocumentFragment();
  imageUrls.forEach((imageUrl, index) => {
    if (index > 0) fragment.append(doc.createElement("br"));
    fragment.append(createResolvedLink(doc, imageUrl));
  });
  return fragment;
}

export function replaceImgurAlbumLinks(messageHtml: string, images: ImgurAlbumImageMap): string {
  if (images.size === 0 || typeof DOMParser === "undefined") return messageHtml;

  const doc = new DOMParser().parseFromString(messageHtml, "text/html");
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const albumKey = normalizeImgurAlbumUrl(anchor.href);
    const imageUrls = albumKey ? images.get(albumKey) : undefined;
    const replacement = albumKey && imageUrls ? replaceAlbumNode(doc, imageUrls) : null;
    if (replacement) anchor.replaceWith(replacement);
  }

  // MessageProcessorがリンク化しなかった本文でも同じフォールバックを使えるよう、
  // アンカー外のテキストノードも置換対象にする。
  const textNodes: Text[] = [];
  const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text && !node.parentElement?.closest("a")) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }
  for (const textNode of textNodes) {
    for (const [albumUrl, imageUrls] of images) {
      const index = textNode.data.indexOf(albumUrl);
      if (index < 0) continue;
      const replacement = replaceAlbumNode(doc, imageUrls);
      if (!replacement) continue;
      const before = doc.createTextNode(textNode.data.slice(0, index));
      const after = doc.createTextNode(textNode.data.slice(index + albumUrl.length));
      const wrapper = doc.createDocumentFragment();
      wrapper.append(before, replacement, after);
      textNode.replaceWith(wrapper);
      break;
    }
  }

  return doc.body.innerHTML;
}

export interface ImgurAlbumMediaState {
  messageHtml: string;
  urls: string[];
  loading: boolean;
}

export function useImgurAlbumMedia(
  messageHtml: string,
  urls: readonly string[],
  threadKey = "default",
): ImgurAlbumMediaState {
  const albumUrls = useMemo(
    () => urls.filter((url, index) => isImgurAlbumUrl(url) && urls.indexOf(url) === index),
    [urls],
  );
  const [images, setImages] = useState<ImgurAlbumImageMap>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImages(new Map());
    if (albumUrls.length === 0) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void imgurAlbumResolver
      .resolveMany(albumUrls, threadKey)
      .then((resolved) => {
        if (cancelled) return;
        setImages(resolved);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[useImgurAlbumMedia] album resolution failed:", error);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [albumUrls, threadKey]);

  const resolvedUrls = useMemo(
    () =>
      urls.flatMap((url) => {
        const resolved = images.get(normalizeImgurAlbumUrl(url) ?? "");
        return resolved ? [...resolved] : [url];
      }),
    [images, urls],
  );
  return {
    messageHtml: replaceImgurAlbumLinks(messageHtml, images),
    urls: resolvedUrls,
    loading,
  };
}
