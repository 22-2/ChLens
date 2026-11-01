import { useMemo } from "react";
import type { useThreadData } from "src/features/thread/browser/use-thread-data";
import { buildBlurredResSet } from "src/view/browser/utils/thread-emphasis";

import type { useImageBlurConfig } from "./use-image-blur-config";

type ThreadDataResult = ReturnType<typeof useThreadData>;

/**
 * 語句によるぼかしと類似画像NGを合わせ、本文と画像一覧で同じぼかし判定を使う。
 * 類似画像NGの判定は、判定後のレスを作るときに useThreadData で済ませて受け取る。
 */
export function useThreadBlurredResNums({
  responses,
  indexes,
  imageBlurConfig,
  similarImageBlurredResNums,
}: {
  responses: ThreadDataResult["responses"];
  indexes: ThreadDataResult["indexes"];
  imageBlurConfig: ReturnType<typeof useImageBlurConfig>;
  similarImageBlurredResNums: ThreadDataResult["similarImageBlurredResNums"];
}) {
  const wordBlurredResNums = useMemo(() => {
    if (!imageBlurConfig.enabled) return new Set<number>();
    return buildBlurredResSet(responses, indexes.repIndex, imageBlurConfig.harmfulWordPattern);
  }, [imageBlurConfig, indexes.repIndex, responses]);
  // 類似画像NGはNGの一部なので、語句によるぼかしの有効・無効（image_blur）には従わない。
  const blurredResNums = useMemo(() => {
    if (similarImageBlurredResNums.size === 0) return wordBlurredResNums;
    return new Set([...wordBlurredResNums, ...similarImageBlurredResNums]);
  }, [similarImageBlurredResNums, wordBlurredResNums]);
  return blurredResNums;
}
