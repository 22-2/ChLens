import { DEFAULT_IMAGE_SIMILARITY, hammingDistance64 } from "@chlen/chlib";
import { ImageOff } from "lucide-react";
import { createLogger } from "src/app/logger";
import { createImageThumbnailFromElement } from "src/features/media/browser/image-hash-reader";
import {
  addImageMenuProvider,
  type ImageMenuContext,
} from "src/features/media/browser/image-menu-contributions";
import { useImageHashStore } from "src/features/media/browser/use-image-hash-store";
import {
  findSimilarImageRecordBySourceUrl,
  pruneSimilarImageRecords,
  saveSimilarImageRecord,
} from "src/features/ng/browser/similar-image-records";
import { container } from "src/service-container/index";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";

const logger = createLogger("NG");

/** 登録したルールの名前。保存時にコメントは残らないため、labelでルールを見分けられるようにする。 */
const SIMILAR_IMAGE_RULE_LABEL = "類似画像";

// 64bitのうち1が8個以下、または56個以上なら「ほぼ単色」とみなす。
// blockhashはブロックの中央値で0と1を決めるため、単色に近い画像は同じ値に偏り、無関係な画像にも当たりやすい。
const NEARLY_FLAT_BIT_MARGIN = 8;

/**
 * 登録するルールのDSL。similarityは既定値でも書き、どこを変えれば厳しさを調整できるかを見て分かるようにする
 * （docs/plans/similar-image-ng-plan.md §5）。
 */
export function buildSimilarImageRuleDsl(hash: string): string {
  return [
    "blur:",
    `  label "${SIMILAR_IMAGE_RULE_LABEL}"`,
    `  similarity ${DEFAULT_IMAGE_SIMILARITY}%`,
    `  when image similar "${hash}"`,
  ].join("\n");
}

export function isNearlyFlatImageHash(hash: string): boolean {
  const ones = hammingDistance64(hash, "0000000000000000");
  return ones <= NEARLY_FLAT_BIT_MARGIN || ones >= 64 - NEARLY_FLAT_BIT_MARGIN;
}

/** 画像のハッシュを求めて、類似画像NGのルールを末尾に足す。 */
export async function registerSimilarImage({
  imageKey,
  image,
  targetWindow,
}: ImageMenuContext): Promise<void> {
  // 同じURLの画像は、ハッシュを求める前に登録済みと分かる（ルールが残っている場合だけ）。
  const sameUrlRecord = await findSimilarImageRecordBySourceUrl(imageKey);
  if (sameUrlRecord && container.ng.hasImageHash(sameUrlRecord.hash)) {
    container.toast.info("この画像は類似画像NGに登録済みです", { targetWindow });
    return;
  }

  let hash: string;
  try {
    hash = await useImageHashStore.getState().getOrComputeHash(imageKey, image);
  } catch (error) {
    logger.error("類似画像NGに登録する画像のハッシュを計算できませんでした", { imageKey, error });
    container.toast.error("画像の特徴を求められなかったため、類似画像NGに登録できませんでした", {
      targetWindow,
    });
    return;
  }

  if (container.ng.hasImageHash(hash)) {
    container.toast.info("この画像は類似画像NGに登録済みです", { targetWindow });
    return;
  }
  if (
    isNearlyFlatImageHash(hash) &&
    !targetWindow.confirm(
      "ほぼ単色の画像です。似ていない画像までぼかすことがあります。類似画像NGに登録しますか？",
    )
  ) {
    return;
  }

  try {
    await container.ng.add(buildSimilarImageRuleDsl(hash));
  } catch (error) {
    logger.error("類似画像NGのルールを保存できませんでした", { imageKey, hash, error });
    container.toast.error("類似画像NGに登録できませんでした", { targetWindow });
    return;
  }
  container.toast.success("類似画像NGに登録しました。取り消すときは設定のNGから削除してください", {
    targetWindow,
  });
  await saveRegisteredImageRecord({ imageKey, image, hash });
}

/**
 * 登録した画像の縮小画像と元のURLを残す。ルールの登録はもう済んでいるので、
 * 失敗してもログを出すだけにする（NGエディタで縮小画像が出ないだけで、判定には影響しない）。
 */
async function saveRegisteredImageRecord({
  imageKey,
  image,
  hash,
}: {
  imageKey: string;
  image: HTMLImageElement;
  hash: string;
}): Promise<void> {
  try {
    const thumbnailDataUrl = await createImageThumbnailFromElement(image);
    await saveSimilarImageRecord({
      hash,
      thumbnailDataUrl,
      sourceUrl: imageKey,
      addedAt: Date.now(),
    });
    // NGエディタでルールを消した画像の記録は、次に登録したときにまとめて捨てる。
    await pruneSimilarImageRecords((registered) => container.ng.hasImageHash(registered));
  } catch (error) {
    logger.error("類似画像NGに登録した画像の記録を保存できませんでした", { imageKey, hash, error });
  }
}

/** 画像の右クリックメニューに「類似画像NGに登録」を足す。 */
export function registerSimilarImageNg(api: ExtensionApi): void {
  api.register(
    addImageMenuProvider((context) => [
      {
        id: "register-similar-image-ng",
        label: "類似画像NGに登録",
        icon: <ImageOff size={14} />,
        onSelect: () => {
          void registerSimilarImage(context);
        },
      },
    ]),
  );
}
