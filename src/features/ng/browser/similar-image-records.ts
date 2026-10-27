import { createLogger } from "src/app/logger";

const logger = createLogger("NG");

/**
 * 類似画像NGに登録した画像の記録。ハッシュ（16進16桁）だけでは何の画像か分からないため、
 * 登録時の縮小画像と元のURLを残し、NGエディタで見分けられるようにする。
 * DSLには入れない（DSLは文字で読み書きするもので、画像を埋め込むと読めなくなるため）。
 */
export interface SimilarImageRecord {
  hash: string;
  /** 長辺96pxのJPEG（data URL）。 */
  thumbnailDataUrl: string;
  sourceUrl: string;
  /** 登録した時刻（ミリ秒）。 */
  addedAt: number;
}

const STORE_NAME = "SimilarImageNg";

// platformのオブジェクトストアは、どの環境でもキーを "url" という項目で持つ。ここではハッシュを入れる。
interface StoredSimilarImageRecord extends Omit<SimilarImageRecord, "hash"> {
  url: string;
}

async function getStore() {
  // platformは読み込み時に拡張機能APIへ触れるため、記録を読み書きするときだけ読み込む。
  const { platform } = await import("src/app/platform");
  return platform.storage.getStore(STORE_NAME);
}

function isStoredRecord(value: unknown): value is StoredSimilarImageRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === "string" &&
    typeof record.thumbnailDataUrl === "string" &&
    typeof record.sourceUrl === "string" &&
    typeof record.addedAt === "number"
  );
}

function fromStored({ url, ...rest }: StoredSimilarImageRecord): SimilarImageRecord {
  return { hash: url, ...rest };
}

export async function saveSimilarImageRecord({ hash, ...rest }: SimilarImageRecord): Promise<void> {
  const record: StoredSimilarImageRecord = { url: hash, ...rest };
  await (await getStore()).put(record);
}

/** ハッシュの記録を返す。記録がない（手で書いたハッシュなど）か、読めなければ null。 */
export async function getSimilarImageRecord(hash: string): Promise<SimilarImageRecord | null> {
  try {
    const value = await (await getStore()).get(hash);
    return isStoredRecord(value) ? fromStored(value) : null;
  } catch (error) {
    logger.error("類似画像NGの登録画像の記録を読めませんでした", { hash, error });
    return null;
  }
}

/** 同じ元のURLの記録を返す（同じ画像の二重登録を防ぐため）。 */
export async function findSimilarImageRecordBySourceUrl(
  sourceUrl: string,
): Promise<SimilarImageRecord | null> {
  try {
    const values = await (await getStore()).getAll();
    const found = values.find(
      (value): value is StoredSimilarImageRecord =>
        isStoredRecord(value) && value.sourceUrl === sourceUrl,
    );
    return found ? fromStored(found) : null;
  } catch (error) {
    logger.error("類似画像NGの登録画像の記録を読めませんでした", { sourceUrl, error });
    return null;
  }
}

/** NGエディタでルールを消したハッシュの記録を捨てる（縮小画像が溜まり続けないようにする）。 */
export async function pruneSimilarImageRecords(
  isRegistered: (hash: string) => boolean,
): Promise<void> {
  const store = await getStore();
  const values = await store.getAll();
  for (const value of values) {
    if (isStoredRecord(value) && !isRegistered(value.url)) await store.delete(value.url);
  }
}
