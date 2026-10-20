import { createLogger } from "src/app/logger";
import { platform } from "src/app/platform";

import {
  IMGUR_DEFAULT_CLIENT_ID,
  IMGUR_IMAGE_API_URL,
  normalizeImgurImageUrl,
} from "./imgur-album";

const logger = createLogger("media");

export const IMGUR_DELETE_TIMEOUT_MS = 30_000;

// 変更理由: Imgurの削除には投稿時に返る deletehash が必要で、画像URLからは復元できない。
// プラットフォームの KeyValueStore に画像IDごとの対応を保存し、投稿したアプリからだけ削除できるようにする。
const DELETEHASH_STORAGE_KEY = "media_imgur_deletehashes";

type DeletehashMap = Record<string, string>;

type ImgurImageDeletedListener = (imageUrl: string) => void;

const deletedListeners = new Set<ImgurImageDeletedListener>();

// 変更理由: 読み書きは同じ保存領域を共有するため、直列化しないと後の書き込みが前の変更を消してしまう。
let pendingStorageWrite: Promise<void> = Promise.resolve();

/** 拡張子・http/https・imgur.com の表記差を吸収し、画像IDを返す。Imgur画像でなければ null。 */
export function getImgurImageId(rawUrl: string): string | null {
  const normalized = normalizeImgurImageUrl(rawUrl);
  if (!normalized) return null;
  const fileName = new URL(normalized).pathname.slice(1);
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

function isDeletehashMap(value: unknown): value is DeletehashMap {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

async function readDeletehashMap(): Promise<DeletehashMap> {
  const raw = await platform.storage.kv.get(DELETEHASH_STORAGE_KEY);
  if (!raw) return {};

  const parsed: unknown = JSON.parse(raw);
  if (!isDeletehashMap(parsed)) {
    throw new Error("Imgurの削除キーの保存形式が想定と異なります");
  }
  return parsed;
}

function updateDeletehashMap(update: (map: DeletehashMap) => void): Promise<void> {
  const task = pendingStorageWrite.then(async () => {
    const map = await readDeletehashMap();
    update(map);
    await platform.storage.kv.set(DELETEHASH_STORAGE_KEY, JSON.stringify(map));
  });
  // 失敗した書き込みで後続の書き込みまで止まらないよう、チェーンの側は成功扱いで繋ぐ。
  pendingStorageWrite = task.catch(() => {});
  return task;
}

/** 投稿で得た削除キーを、画像IDと対応づけて保存する。 */
export async function saveImgurDeletehash(imageUrl: string, deletehash: string): Promise<void> {
  const imageId = getImgurImageId(imageUrl);
  if (!imageId) {
    throw new Error(`Imgurの画像IDを取得できませんでした: ${imageUrl}`);
  }
  await updateDeletehashMap((map) => {
    map[imageId] = deletehash;
  });
}

/** 削除キーを持つ画像（このアプリから投稿した画像）かどうかを返す。 */
export async function hasImgurDeletehash(imageUrl: string): Promise<boolean> {
  const imageId = getImgurImageId(imageUrl);
  if (!imageId) return false;
  const map = await readDeletehashMap();
  return Object.hasOwn(map, imageId);
}

/**
 * Imgurから画像を削除し、成功したら保存済みの削除キーも消す。
 * 失敗時は理由を含むエラーを投げ、呼び出し側で利用者へ伝えられるようにする。
 */
export async function deleteImgurImage(imageUrl: string): Promise<void> {
  const imageId = getImgurImageId(imageUrl);
  const map = await readDeletehashMap();
  const deletehash = imageId ? map[imageId] : undefined;
  if (!imageId || deletehash === undefined) {
    throw new Error("この画像はこのアプリから投稿されていないため、削除できません");
  }

  // 変更理由: 削除は deletehash を認証情報として行うため、設定のClient-IDを読む必要がない。
  // 設定サービスへの依存を持つと、ビューア単体のテストやPortal表示の読み込みが拡張機能APIを要求するため、既定IDで送る。
  const response = await platform.http.fetch(
    `${IMGUR_IMAGE_API_URL}/${encodeURIComponent(deletehash)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Client-ID ${IMGUR_DEFAULT_CLIENT_ID}`,
        Accept: "application/json",
      },
      timeout: IMGUR_DELETE_TIMEOUT_MS,
    },
  );
  assertImgurDeleteSucceeded(response.body, response.status);

  await updateDeletehashMap((latest) => {
    delete latest[imageId];
  });
  for (const listener of deletedListeners) {
    listener(imageUrl);
  }
}

function assertImgurDeleteSucceeded(body: string, status: number): void {
  let payload: { success?: unknown; data?: unknown };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch (error) {
    logger.error("Imgur削除APIの応答を解析できませんでした", { status, body, error });
    throw new Error(`Imgur APIから不正な応答が返されました (HTTP ${status})`, { cause: error });
  }

  if (status >= 200 && status < 300 && payload.success === true) return;

  const detail =
    typeof payload.data === "object" && payload.data !== null && "error" in payload.data
      ? payload.data.error
      : undefined;
  logger.error("Imgurからの画像削除に失敗しました", { status, detail });
  throw new Error(
    typeof detail === "string" && detail.length > 0
      ? `Imgurからの画像削除に失敗しました: ${detail}`
      : `Imgurからの画像削除に失敗しました (HTTP ${status})`,
  );
}

/** 画像が削除されたことを通知する。書き込み欄など本文を持つ側が、対応するURL行を取り除くために使う。 */
export function subscribeImgurImageDeleted(listener: ImgurImageDeletedListener): () => void {
  deletedListeners.add(listener);
  return () => {
    deletedListeners.delete(listener);
  };
}

/** 本文から、指定画像を指すURLだけの行を取り除く。前後の文章や他のURLは残す。 */
export function removeImgurImageLines(message: string, imageUrl: string): string {
  const imageId = getImgurImageId(imageUrl);
  if (!imageId) return message;
  return message
    .split("\n")
    .filter((line) => getImgurImageId(line.trim()) !== imageId)
    .join("\n");
}
