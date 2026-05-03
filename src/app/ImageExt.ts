/**
 * ブラウザに応じた画像拡張子を取得するユーティリティ
 */

export function getImageExt(): "webp" | "png" {
  // Chromeはwebp、Firefoxはpngを使用
  const isFirefox = navigator.userAgent.includes("Firefox");
  return isFirefox ? "png" : "webp";
}

export function resolveImagePath(path: string): string {
  const ext = getImageExt();
  return path.replace(/&\[IMG_EXT\]/g, ext);
}
