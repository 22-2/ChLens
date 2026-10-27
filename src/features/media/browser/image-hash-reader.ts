import { isTauriRuntime } from "src/app/platform/runtime";

import { computeImageBlockhash, IMAGE_HASH_CANVAS_SIZE } from "../domain/image-blockhash";

/**
 * 画像を決めた大きさのcanvasに描いて、類似画像NGのハッシュを求める。
 * 透過部分は白で塗ってから描く（ハッシュの仕様。docs/plans/similar-image-ng-plan.md §3）。
 * 補助ウィンドウの画像もあるため、canvasは画像と同じdocumentで作る。
 */
function hashDrawable(source: CanvasImageSource, ownerDocument: Document): string {
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = IMAGE_HASH_CANVAS_SIZE;
  canvas.height = IMAGE_HASH_CANVAS_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("類似画像NGのハッシュ計算用のcanvasを作れません");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, IMAGE_HASH_CANVAS_SIZE, IMAGE_HASH_CANVAS_SIZE);
  context.drawImage(source, 0, 0, IMAGE_HASH_CANVAS_SIZE, IMAGE_HASH_CANVAS_SIZE);
  return computeImageBlockhash(
    context.getImageData(0, 0, IMAGE_HASH_CANVAS_SIZE, IMAGE_HASH_CANVAS_SIZE),
  );
}

function getRenderedSrc(image: HTMLImageElement): string {
  return image.currentSrc || image.src;
}

/**
 * 表示中の<img>からピクセルを読めるか。
 * Chrome拡張機能のページは host_permissions により別オリジンの画像も読める。
 * Tauriのページは画像と別オリジンでcanvasが汚染されるため、blob URLへ切り替え済みの画像だけ読む
 * （フェーズ0の計測。docs/plans/similar-image-ng-plan.md §11）。
 */
function canReadFromElement(image: HTMLImageElement): boolean {
  const src = getRenderedSrc(image);
  if (src.startsWith("blob:") || src.startsWith("data:")) return true;
  return !isTauriRuntime();
}

function isSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "SecurityError";
}

/** 画像のバイト列をプラットフォームのHTTPで取り直し、デコードしてから読む。 */
async function readFromRefetch<T>(
  url: string,
  ownerDocument: Document,
  read: (source: CanvasImageSource, ownerDocument: Document) => T,
): Promise<T> {
  // platformは読み込み時に拡張機能APIへ触れるため、ギャラリーを描くだけの画面やテストへ持ち込まない。
  // 取り直しはTauriなど一部の環境でしか使わないので、必要になったときに読み込む。
  const { platform } = await import("src/app/platform");
  const fetchBinary = platform.http.fetchBinary;
  if (!fetchBinary) throw new Error("この環境では画像のバイト列を取得できません");
  const response = await fetchBinary(url);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`画像を取り直せませんでした（HTTP ${response.status}）`);
  }
  const bitmap = await createImageBitmap(new Blob([response.body]));
  try {
    return read(bitmap, ownerDocument);
  } finally {
    bitmap.close();
  }
}

/**
 * 読み込み済みの<img>のピクセルを読む処理を、読める画像で実行する。
 * 表示した画像から読めるときは取り直さない。読めない環境と、想定外に汚染された場合だけ取り直す。
 */
async function readImage<T>(
  image: HTMLImageElement,
  read: (source: CanvasImageSource, ownerDocument: Document) => T,
): Promise<T> {
  const src = getRenderedSrc(image);
  if (canReadFromElement(image)) {
    try {
      return read(image, image.ownerDocument);
    } catch (error) {
      if (!isSecurityError(error)) throw error;
    }
  }
  return readFromRefetch(src, image.ownerDocument, read);
}

/** 読み込み済みの<img>から、類似画像NGのハッシュを求める。 */
export function computeImageHashFromElement(image: HTMLImageElement): Promise<string> {
  return readImage(image, hashDrawable);
}

// 類似画像NGに登録した画像を、あとで見分けるための縮小画像の大きさ（長辺）。
const THUMBNAIL_MAX_SIZE = 96;

function thumbnailDrawable(source: CanvasImageSource, ownerDocument: Document): string {
  const { width, height } = getDrawableSize(source);
  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height, 1));
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("縮小画像を作るためのcanvasを作れません");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  // 汚染されたcanvasではSecurityErrorになり、readImageが取り直しへ切り替える。
  return canvas.toDataURL("image/jpeg", 0.8);
}

function getDrawableSize(source: CanvasImageSource): { width: number; height: number } {
  // 補助ウィンドウの画像は別のrealmの要素なので、instanceofではなく持っている値で見分ける。
  if ("naturalWidth" in source) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  const { width, height } = source as { width: number; height: number };
  return { width, height };
}

/**
 * 読み込み済みの<img>から、長辺96pxのJPEGの縮小画像（data URL）を作る。
 * 類似画像NGに登録した画像を、NGエディタで見分けられるようにするため。
 */
export function createImageThumbnailFromElement(image: HTMLImageElement): Promise<string> {
  return readImage(image, thumbnailDrawable);
}
