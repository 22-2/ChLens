import { useEffect, useState } from "react";
import { createLogger } from "src/app/logger";

import { hasImgurDeletehash } from "../application/imgur-deletehash";

const logger = createLogger("media");

/** 表示中の画像がこのアプリから投稿したImgur画像で、削除できるかを返す。 */
export function useImgurDeletableImage(imageUrl: string | null): boolean {
  // 結果には判定した画像URLを添えて、表示中の画像が切り替わった直後に前の画像の結果を使わないようにする。
  const [result, setResult] = useState<{ imageUrl: string; isDeletable: boolean } | null>(null);

  useEffect(() => {
    if (!imageUrl) return;

    let isCurrent = true;
    hasImgurDeletehash(imageUrl)
      .then((isDeletable) => {
        if (isCurrent) setResult({ imageUrl, isDeletable });
      })
      .catch((error: unknown) => {
        logger.error("画像の削除キーを確認できませんでした", { url: imageUrl, error });
      });
    return () => {
      isCurrent = false;
    };
  }, [imageUrl]);

  return result !== null && result.imageUrl === imageUrl && result.isDeletable;
}
