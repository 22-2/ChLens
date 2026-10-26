import { platform } from "src/app/platform";
import type { ClipboardSurface } from "src/view/browser/utils/clipboard";

const IMAGE_COPY_TIMEOUT_MS = 30_000;

async function fetchViewerImage(src: string, surface: ClipboardSurface): Promise<Blob> {
  if (!/^https?:/iu.test(src)) {
    // Tauriの代替表示で使うblob URLは元のウィンドウで生成されるため、その画面から読む。
    const response = await surface.window.fetch(src);
    if (!response.ok) throw new Error(`表示中の画像を取得できませんでした: ${response.status}`);
    return response.blob();
  }

  const fetchBinary = platform.http.fetchBinary;
  if (!fetchBinary) throw new Error("この環境では画像のバイナリ取得に対応していません");
  const response = await fetchBinary(src, {
    headers: { Accept: "image/*" },
    timeout: IMAGE_COPY_TIMEOUT_MS,
    // ビューアに表示されたHTTP画像と別のHTTPS画像へ切り替わらないよう、同じURLを取得する。
    httpsMode: "auto",
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`画像取得のHTTPステータスが不正です: ${response.status}`);
  }

  const contentType = Object.entries(response.headers)
    .find(([name]) => name.toLowerCase() === "content-type")?.[1]
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return new Blob([response.body], { type: contentType ?? "application/octet-stream" });
}

export async function createViewerClipboardPng(
  src: string,
  surface: ClipboardSurface,
): Promise<Blob> {
  const image = await fetchViewerImage(src, surface);
  if (image.size === 0) throw new Error("表示中の画像が空です");
  if (image.type === "image/png") return image;

  // JPEG・WebP・GIFなどはClipboard APIが受け付けるPNGへ変換する。
  const bitmap = await surface.window.createImageBitmap(image);
  try {
    const canvas = surface.document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像コピー用の描画領域を作成できませんでした");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("画像をPNGへ変換できませんでした"))),
        "image/png",
      );
    });
  } finally {
    bitmap.close();
  }
}
