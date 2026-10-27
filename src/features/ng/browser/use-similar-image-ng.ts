import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useImageHashStore } from "src/features/media/browser/use-image-hash-store";
import { collectResImageUrls } from "src/features/media/domain/thread-images";
import { useIsNgTemporarilyDisabled } from "src/features/ng/browser/use-ng-status";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";

interface UseSimilarImageNgOptions {
  responses: readonly IRes[];
  threadTitle: string;
  threadUrl: string;
  messageProtocol: string;
}

/**
 * 類似画像NGでぼかすレスの番号を返す。
 *
 * ルールがあるときだけ、media のストアに画像のハッシュ計算を有効にさせる。
 * 判定はストアのハッシュから描画中に同期的に導く。ハッシュが出て「判定待ち」のぼかしが外れる描画と、
 * NGのぼかしが掛かる描画を同じにしないと、NG画像が一瞬見えてしまうため（effectで遅らせない）。
 */
export function useSimilarImageNg({
  responses,
  threadTitle,
  threadUrl,
  messageProtocol,
}: UseSimilarImageNgOptions): ReadonlySet<number> {
  const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
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
    const blurred = new Set<number>();
    if (!hashingEnabled) return blurred;
    // ルールの更新をこの判定に結び付ける（ルール本体はcontainer.ngが持つ）。
    void revision;
    for (const res of responses) {
      const hashes: string[] = [];
      for (const url of collectResImageUrls(res, messageProtocol)) {
        const entry = imageHashEntries.get(url);
        if (entry?.status === "ready") hashes.push(entry.hash);
      }
      if (hashes.length === 0) continue;
      if (container.ng.isSimilarImageNG(res, threadTitle, threadUrl, hashes)) blurred.add(res.num);
    }
    return blurred;
  }, [
    hashingEnabled,
    imageHashEntries,
    messageProtocol,
    responses,
    revision,
    threadTitle,
    threadUrl,
  ]);
}
