import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { INGResult } from "src/core/ports/ng";
import {
  type ImageHashEntry,
  useImageHashStore,
} from "src/features/media/browser/use-image-hash-store";
import { collectResImageUrls } from "src/features/media/domain/thread-images";
import { formatSimilarImageBlurReason } from "src/features/ng/browser/similar-image-blur-reason";
import { useIsNgTemporarilyDisabled } from "src/features/ng/browser/use-ng-status";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

interface UseSimilarImageNgOptions {
  responses: readonly IRes[];
  threadTitle: string;
  threadUrl: string;
  messageProtocol: string;
}

export interface SimilarImageNgResult {
  /** 類似画像NG（blur）でぼかすレスの番号。 */
  readonly blurredResNums: ReadonlySet<number>;
  /** 類似画像NG（hide・collapse）が一致したレスの結果。レス番号ごと。 */
  readonly responseNgByNum: ReadonlyMap<number, INGResult>;
  /** ぼかしたレスの理由（画像にかざしたときに出す文言）。レス番号ごと。 */
  readonly blurReasonByNum: ReadonlyMap<number, string>;
}

/**
 * 類似画像NGの判定結果を返す。ぼかすレスの番号と、隠す・折りたたむレスの結果を含む。
 *
 * ルールがあるときだけ、media のストアに画像のハッシュ計算を有効にさせる。
 * 判定はストアのハッシュから描画中に同期的に導く。ハッシュが出て「判定待ち」のぼかしが外れる描画と、
 * NGのぼかしや非表示が掛かる描画を同じにしないと、NG画像が一瞬見えてしまうため（effectで遅らせない）。
 */
export function useSimilarImageNg({
  responses,
  threadTitle,
  threadUrl,
  messageProtocol,
}: UseSimilarImageNgOptions): SimilarImageNgResult {
  const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
  const { value: excludeFirstResponse } = useConfigBooleanSetting("ng_exclude_first_response");
  const [ruleState, setRuleState] = useState(() => ({
    hasImageRules: container.ng.hasImageRules(),
    revision: 0,
  }));

  useEffect(() => {
    // ルールの追加・削除・similarityの変更を、表示中のスレへすぐ反映する。
    const handleNgChanged = () => {
      setRuleState((current) => ({
        hasImageRules: container.ng.hasImageRules(),
        revision: current.revision + 1,
      }));
    };
    container.message.on("ng_changed", handleNgChanged);
    return () => container.message.off("ng_changed", handleNgChanged);
  }, []);

  const hashingEnabled = ruleState.hasImageRules && !isNgTemporarilyDisabled;
  // 描画前に切り替え、キャッシュ済みの画像が判定待ちのぼかしなしで一瞬表示されないようにする。
  // ルールと一時解除はどのスレでも同じ値なので、複数のスレを開いていても同じ値を書き込む。
  useLayoutEffect(() => {
    useImageHashStore.getState().setHashingEnabled(hashingEnabled);
  }, [hashingEnabled]);

  const imageHashEntries = useImageHashStore((state) => state.entries);
  const { revision } = ruleState;

  return useMemo(() => {
    const blurredResNums = new Set<number>();
    const responseNgByNum = new Map<number, INGResult>();
    const blurReasonByNum = new Map<number, string>();
    if (!hashingEnabled) return { blurredResNums, responseNgByNum, blurReasonByNum };
    // ルールの更新をこの判定に結び付ける（ルール本体はcontainer.ngが持つ）。
    void revision;
    for (const res of responses) {
      // 変更理由: 類似画像NGは evaluateThreadNg を通らず描画中に別経路で判定するため、
      // 「>>1をNG対象から除外する」設定がここでは効かず、画像だけの>>1が隠れていた。
      if (excludeFirstResponse && res.num === 1) continue;
      const hashes = readyImageHashes(res, messageProtocol, imageHashEntries);
      if (hashes.length === 0) continue;
      const blurResult = container.ng.isSimilarImageNG(res, threadTitle, threadUrl, hashes);
      if (blurResult) {
        blurredResNums.add(res.num);
        blurReasonByNum.set(res.num, formatSimilarImageBlurReason(blurResult));
      }
      const responseNg = container.ng.isSimilarImageResponseNG(res, threadTitle, threadUrl, hashes);
      if (responseNg) responseNgByNum.set(res.num, responseNg);
    }
    return { blurredResNums, responseNgByNum, blurReasonByNum };
  }, [
    excludeFirstResponse,
    hashingEnabled,
    imageHashEntries,
    messageProtocol,
    responses,
    revision,
    threadTitle,
    threadUrl,
  ]);
}

/** レスの画像のうち、ハッシュが出ているものだけを返す。判定待ちや失敗した画像は判定に含めない。 */
function readyImageHashes(
  res: IRes,
  messageProtocol: string,
  entries: ReadonlyMap<string, ImageHashEntry>,
): string[] {
  const hashes: string[] = [];
  for (const url of collectResImageUrls(res, messageProtocol)) {
    const entry = entries.get(url);
    if (entry?.status === "ready") hashes.push(entry.hash);
  }
  return hashes;
}
