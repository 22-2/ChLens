import { platform } from "src/app/platform";
import { container } from "src/service-container";

import { IMGUR_DEFAULT_CLIENT_ID, IMGUR_IMAGE_API_URL } from "./imgur-album";

export const IMGUR_UPLOAD_TIMEOUT_MS = 60_000;

interface ImgurUploadResponse {
  success?: unknown;
  data?: {
    link?: unknown;
    error?: unknown;
  };
  error?: unknown;
}

function getImgurAuthorization(): string {
  const accessToken = container.config.get("imgur_access_token")?.trim();
  const clientId = container.config.get("imgur_client_id")?.trim() || IMGUR_DEFAULT_CLIENT_ID;
  return accessToken ? `Bearer ${accessToken}` : `Client-ID ${clientId}`;
}

function parseImgurUploadResponse(body: string, status: number): string {
  let payload: ImgurUploadResponse;
  try {
    payload = JSON.parse(body) as ImgurUploadResponse;
  } catch (error) {
    throw new Error(`Imgur APIから不正な応答が返されました (HTTP ${status})`, { cause: error });
  }

  if (status < 200 || status >= 300 || payload.success !== true) {
    const detail = payload.data?.error ?? payload.error;
    throw new Error(
      typeof detail === "string" && detail.length > 0
        ? `Imgurへの画像投稿に失敗しました: ${detail}`
        : `Imgurへの画像投稿に失敗しました (HTTP ${status})`,
    );
  }

  if (typeof payload.data?.link !== "string") {
    throw new Error("Imgur APIの応答に画像URLがありません");
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(payload.data.link);
  } catch (error) {
    throw new Error("Imgur APIから有効な画像URLが返されませんでした", { cause: error });
  }
  if (
    imageUrl.protocol !== "https:" ||
    !["i.imgur.com", "imgur.com"].includes(imageUrl.hostname.toLowerCase())
  ) {
    throw new Error("Imgur APIから想定外の画像URLが返されました");
  }

  return imageUrl.href;
}

/** ブラウザーまたはTauriの共通HTTP層から画像をImgurへ投稿する。 */
export async function uploadImageToImgur(image: Blob): Promise<string> {
  if (!image.type.startsWith("image/") || image.type === "image/svg+xml" || image.size === 0) {
    throw new Error("有効な画像を選択してください");
  }

  const boundary = `readcrx2-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="upload"\r\nContent-Type: ${image.type}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  // 変更理由: 共通HttpClientはFormDataを受け取らないため、Tauriと拡張機能の両方で
  // 同じmultipart形式を送れるよう、画像Blobを境界文字列と結合してArrayBufferにする。
  const body = await new Blob([prefix, image, suffix]).arrayBuffer();

  const response = await platform.http.fetch(IMGUR_IMAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: getImgurAuthorization(),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Accept: "application/json",
    },
    body,
    timeout: IMGUR_UPLOAD_TIMEOUT_MS,
  });

  return parseImgurUploadResponse(response.body, response.status);
}
