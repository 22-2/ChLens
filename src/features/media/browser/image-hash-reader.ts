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

/** 画像のバイト列をプラットフォームのHTTPで取り直し、デコードしてハッシュを求める。 */
async function hashFromRefetch(url: string, ownerDocument: Document): Promise<string> {
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
    return hashDrawable(bitmap, ownerDocument);
  } finally {
    bitmap.close();
  }
}

/**
 * 読み込み済みの<img>から、類似画像NGのハッシュを求める。
 * 表示した画像から読めるときは取り直さない。読めない環境と、想定外に汚染された場合だけ取り直す。
 */
export async function computeImageHashFromElement(image: HTMLImageElement): Promise<string> {
  const src = getRenderedSrc(image);
  if (canReadFromElement(image)) {
    try {
      return hashDrawable(image, image.ownerDocument);
    } catch (error) {
      if (!isSecurityError(error)) throw error;
    }
  }
  return hashFromRefetch(src, image.ownerDocument);
}
