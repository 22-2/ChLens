import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createLogger } from "src/core/logger";
import type { IRes } from "src/service-container/interfaces";
import { container } from "src/service-container/index";
import {
  checkSimilarImages,
  extractImageUrlsFromRes,
  getSimilarImageNgRules,
  type SimilarImageNgRule,
} from "src/view/browser/utils/similar-image-ng";

const logger = createLogger("useSimilarImageNG");

export interface UseSimilarImageNgOptions {
  /** image_blur設定が無効、または一時NG解除中のときは計算自体を止める。 */
  enabled?: boolean;
  threadUrl?: string;
  rootMargin?: string;
}

function makeImageKey(resNum: number, imageUrls: readonly string[]): string {
  return `${resNum}\u0000${imageUrls.join("\u0000")}`;
}

function hasSameSet(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function hasSameRules(
  left: readonly SimilarImageNgRule[],
  right: readonly SimilarImageNgRule[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (rule, index) =>
      rule.threshold === right[index]?.threshold &&
      rule.hash.rawHash === right[index]?.hash.rawHash,
  );
}

/** 表示付近のレスだけをdHash評価し、類似画像に一致したレス番号を返す。 */
export function useSimilarImageNg(
  responses: readonly IRes[],
  rootRef: RefObject<HTMLDivElement | null>,
  options: UseSimilarImageNgOptions = {},
): Set<number> {
  const { enabled = true, rootMargin = "200px", threadUrl } = options;
  const [blurredResNums, setBlurredResNums] = useState<Set<number>>(() => new Set());
  const [similarImageRules, setSimilarImageRules] = useState(() =>
    getSimilarImageNgRules(undefined, threadUrl),
  );
  const computedKeyByResRef = useRef(new Map<number, string>());
  const processingGenerationByKeyRef = useRef(new Map<string, number>());
  const matchedKeyByResRef = useRef(new Map<number, string>());
  const generationRef = useRef(0);

  const imageUrlMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const res of responses) {
      const imageUrls = extractImageUrlsFromRes(res);
      if (imageUrls.length > 0) map.set(res.num, imageUrls);
    }
    return map;
  }, [responses]);

  useEffect(() => {
    const refreshSimilarImageRules = () => {
      const nextRules = getSimilarImageNgRules(undefined, threadUrl);
      setSimilarImageRules((currentRules) =>
        hasSameRules(currentRules, nextRules) ? currentRules : nextRules,
      );
    };
    refreshSimilarImageRules();
    try {
      container.message.on("ng_changed", refreshSimilarImageRules);
    } catch (error) {
      logger.error("類似画像NGの変更通知を購読できません", { error });
    }
    return () => {
      try {
        container.message.off("ng_changed", refreshSimilarImageRules);
      } catch (error) {
        logger.error("類似画像NGの変更通知を解除できません", { error });
      }
    };
  }, [threadUrl]);

  useEffect(() => {
    // ルール・スレッド・有効状態が変わった結果を前の条件で再利用しない。
    // 進行中のPromiseは世代番号で無効化し、遅れて返った判定が新しい表示へ混ざるのを防ぐ。
    generationRef.current += 1;
    computedKeyByResRef.current.clear();
    processingGenerationByKeyRef.current.clear();
    matchedKeyByResRef.current.clear();
    setBlurredResNums(new Set());
  }, [enabled, similarImageRules, threadUrl]);

  useEffect(() => {
    const currentKeys = new Map<number, string>();
    for (const [resNum, imageUrls] of imageUrlMap) {
      currentKeys.set(resNum, makeImageKey(resNum, imageUrls));
    }

    for (const [resNum, key] of computedKeyByResRef.current) {
      if (currentKeys.get(resNum) !== key) computedKeyByResRef.current.delete(resNum);
    }
    for (const [resNum, key] of matchedKeyByResRef.current) {
      if (currentKeys.get(resNum) !== key) matchedKeyByResRef.current.delete(resNum);
    }

    const nextBlurredResNums = new Set(matchedKeyByResRef.current.keys());
    setBlurredResNums((current) =>
      hasSameSet(current, nextBlurredResNums) ? current : nextBlurredResNums,
    );
  }, [imageUrlMap]);

  useEffect(() => {
    if (!enabled || similarImageRules.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      logger.error("IntersectionObserverが利用できないため類似画像NGを適用できません");
      return;
    }

    const generation = generationRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;

          const resNum = Number(entry.target.dataset.resNum);
          const imageUrls = imageUrlMap.get(resNum);
          if (!Number.isInteger(resNum) || !imageUrls) continue;

          const imageKey = makeImageKey(resNum, imageUrls);
          if (
            computedKeyByResRef.current.get(resNum) === imageKey ||
            processingGenerationByKeyRef.current.has(imageKey)
          ) {
            continue;
          }

          processingGenerationByKeyRef.current.set(imageKey, generation);
          void checkSimilarImages(imageUrls, similarImageRules)
            .then((matched) => {
              if (
                generation !== generationRef.current ||
                imageUrlMap.get(resNum) == null ||
                makeImageKey(resNum, imageUrlMap.get(resNum) ?? []) !== imageKey
              ) {
                return;
              }

              computedKeyByResRef.current.set(resNum, imageKey);
              if (matched) {
                matchedKeyByResRef.current.set(resNum, imageKey);
                setBlurredResNums(new Set(matchedKeyByResRef.current.keys()));
              }
            })
            .catch((error: unknown) => {
              if (
                generation === generationRef.current &&
                imageUrlMap.get(resNum) != null &&
                makeImageKey(resNum, imageUrlMap.get(resNum) ?? []) === imageKey
              ) {
                // 予期しない失敗でも同じレスを交差のたびに再試行せず、表示を優先する。
                computedKeyByResRef.current.set(resNum, imageKey);
              }
              logger.error("類似画像NGの判定に失敗しました", { resNum, imageUrls, error });
            })
            .finally(() => {
              if (processingGenerationByKeyRef.current.get(imageKey) === generation) {
                processingGenerationByKeyRef.current.delete(imageKey);
              }
            });
        }
      },
      { rootMargin },
    );

    const observeImageResponses = () => {
      const root = rootRef.current;
      if (!root) return;
      for (const element of root.querySelectorAll<HTMLElement>("[data-res-num]")) {
        // 本文NGで置き換えたプレースホルダーは画像を表示しないため、取得負荷を発生させない。
        if (element.classList.contains("res--ng-placeholder")) continue;
        const resNum = Number(element.dataset.resNum);
        if (imageUrlMap.has(resNum)) observer.observe(element);
      }
    };

    observeImageResponses();

    const root = rootRef.current;
    let mutationObserver: MutationObserver | undefined;
    if (root && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(observeImageResponses);
      mutationObserver.observe(root, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
      mutationObserver?.disconnect();
    };
  }, [enabled, imageUrlMap, rootMargin, rootRef, similarImageRules]);

  return blurredResNums;
}
