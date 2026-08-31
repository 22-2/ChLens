# 類似画像NG（モザイク）実装計画

## 概要

レスの画像サムネイルに対して知覚ハッシュ（dHash）を計算し、NG登録された画像と類似する場合に既存のぼかし（モザイク）エフェクトを適用する機能。
レス自体を非表示にするのではなく、既存の `image_blur` と同様にサムネイルのぼかしのみを行う。
NGエディタ（Monaco DSL）から編集可能。

## 使用ライブラリ

- `browser-image-hash` — ブラウザ向け知覚ハッシュ（dHash/aHash/pHash/wHash）
  - `DifferenceHashBuilder` で64bit dHash を計算
  - `Hash.getHammingDistance()` で類似度判定
  - fetch→Canvas→hash までよしなにやってくれる
  - 拡張機能の host permission 下では CORS 制約を気にせず使える

## アーキテクチャ

```
ThreadPage.tsx
  │
  ├── textBlurredResNums  = buildBlurredResSet(...)          ← 既存（テキストマッチ）
  ├── similarImageBlurred = useSimilarImageNg(responses, rootRef) ← 新規（async, IntersectionObserver）
  │
  ├── blurredResNums = textBlurred ∪ similarImageBlurred     ← マージ
  │
  └── ResItem isImageBlurred={blurredResNums.has(res.num)}   ← 既存のまま
```

### パフォーマンス戦略

- `IntersectionObserver` でビューポート進入時にのみハッシュ計算
- `rootMargin: "200px"` で少し手前から先読み
- 計算済みのレスはキャッシュして再計算しない
- 処理中のレスは二重実行を防止

---

## 変更ファイル一覧

### 新規作成（3ファイル）

| #   | ファイル                                         | 役割                                                                  |
| --- | ------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | `src/view/browser/utils/similar-image-ng.ts`     | 純粋関数：画像URL抽出、dHash計算、NGルール照合                        |
| 2   | `src/view/browser/hooks/use-similar-image-ng.ts` | React hook：IntersectionObserver + 非同期ハッシュ計算 + 結果state管理 |
| 3   | `docs/plans/similar-image-ng-plan.md`            | 本計画書（このファイル）                                              |

### 修正（5ファイル）

| #   | ファイル                                | 変更内容                                                                                         |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 4   | `src/core/NGTypes.ts`                   | `SIMILAR_IMAGE: "SimilarImage"` を追加                                                           |
| 5   | `src/core/ngDsl.ts`                     | `NG_DSL_RULE_SPECS` に `SimilarImage` 定義を追加                                                 |
| 6   | `src/core/NGMatcher.ts`                 | `BOARD_ALLOWED_TYPES` / `THREAD_DENIED_TYPES` に `SimilarImage` を追加（テキストマッチから除外） |
| 7   | `src/core/NG.ts`                        | （必要な場合）`SimilarImage` ルール抽出用ユーティリティ                                          |
| 8   | `src/view/browser/pages/ThreadPage.tsx` | `useSimilarImageNg` hook を呼び出し、`blurredResNums` をマージ                                   |

---

## 各ファイルの詳細

### 1. `src/view/browser/utils/similar-image-ng.ts`

```ts
import { DifferenceHashBuilder, Hash } from "browser-image-hash";
import { container } from "src/service-container/index";
import { TYPE, type InternalNGElement } from "src/core/NGTypes";
import { extractUrlsFromMessage, hasImage } from "src/view/browser/utils/utils";
import type { IRes } from "src/service-container/interfaces";

interface SimilarImageRule {
  hash: Hash;
  threshold: number;
}

/** NGルールから SimilarImage タイプのものだけを抽出 */
export function getSimilarImageNgRules(): SimilarImageRule[] {
  const ng = container.ng.get?.() ?? new Set<InternalNGElement>();
  const rules: SimilarImageRule[] = [];
  for (const n of ng) {
    if (n.type !== TYPE.SIMILAR_IMAGE || !n.word) continue;
    try {
      rules.push({
        hash: new Hash(n.word),
        threshold: Number(n.params?.threshold ?? 10),
      });
    } catch {
      /* 不正なハッシュ値はスキップ */
    }
  }
  return rules;
}

/** レスから画像URLの配列を抽出 */
export function extractImageUrlsFromRes(res: IRes): string[] {
  const allUrls = extractUrlsFromMessage(res.message);
  return allUrls.filter((url) => hasImage(url));
}

/** 画像URLの配列をNGルールと照合。1つでもマッチすれば true */
export async function checkSimilarImages(
  imageUrls: string[],
  rules: SimilarImageRule[],
): Promise<boolean> {
  const builder = new DifferenceHashBuilder();
  for (const url of imageUrls) {
    try {
      const dHash = await builder.build(new URL(url));
      for (const rule of rules) {
        if (rule.hash.getHammingDistance(dHash) <= rule.threshold) {
          return true;
        }
      }
    } catch {
      // fetch失敗（404, CORSエラー等）は無視して次へ
      continue;
    }
  }
  return false;
}
```

### 2. `src/view/browser/hooks/use-similar-image-ng.ts`

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { IRes } from "src/service-container/interfaces";
import {
  checkSimilarImages,
  extractImageUrlsFromRes,
  getSimilarImageNgRules,
} from "src/view/browser/utils/similar-image-ng";

/**
 * 類似画像NGによるぼかし対象のレス番号セットを返す。
 * IntersectionObserver でビューポート進入時にのみハッシュ計算を行う。
 */
export function useSimilarImageNg(
  responses: IRes[],
  rootRef: RefObject<HTMLDivElement | null>,
): Set<number> {
  const [blurredResNums, setBlurredResNums] = useState<Set<number>>(new Set());
  const computedRef = useRef<Set<number>>(new Set());
  const processingRef = useRef<Set<number>>(new Set());
  const blurAccumRef = useRef<Set<number>>(new Set());

  // レス番号 → 画像URL配列 の索引
  const imageUrlMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const res of responses) {
      const urls = extractImageUrlsFromRes(res);
      if (urls.length > 0) map.set(res.num, urls);
    }
    return map;
  }, [responses]);

  // IntersectionObserver でビューポート進入を検知
  useEffect(() => {
    const rules = getSimilarImageNgRules();
    if (rules.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          const resEl = target.closest("[data-res-num]") as HTMLElement | null;
          if (!resEl) continue;

          const resNum = Number(resEl.dataset.resNum);
          if (computedRef.current.has(resNum) || processingRef.current.has(resNum)) {
            continue;
          }

          const urls = imageUrlMap.get(resNum);
          if (!urls || urls.length === 0) {
            computedRef.current.add(resNum);
            continue;
          }

          processingRef.current.add(resNum);
          checkSimilarImages(urls, rules).then((matched) => {
            processingRef.current.delete(resNum);
            computedRef.current.add(resNum);
            if (matched) {
              blurAccumRef.current.add(resNum);
              setBlurredResNums(new Set(blurAccumRef.current));
            }
          });
        }
      },
      { rootMargin: "200px" },
    );

    const thumbs = rootRef.current?.querySelectorAll(".res__thumbs");
    thumbs?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [imageUrlMap, rootRef]);

  return blurredResNums;
}
```

### 3. 本計画書（このファイル）

---

### 4. `src/core/NGTypes.ts` 変更

`TYPE` オブジェクトに以下を追加：

```ts
SIMILAR_IMAGE: "SimilarImage",
```

挿入位置：`TYPE` オブジェクト内の適切な位置（`REG_EXP_URL` の後など）

---

### 5. `src/core/ngDsl.ts` 変更

`NG_DSL_RULE_SPECS` 配列に以下を追加：

```ts
{
  keyword: "SimilarImage",
  aliases: [],
  description: "似た画像のサムネイルをモザイク処理します（知覚ハッシュdHash）",
  parameters: [
    VALUE_PARAMETER,
    SITES_PARAMETER,
    {
      name: "threshold",
      detail: "許容ハミング距離",
      documentation:
        "小さいほど厳密に判定します。64bit dHash の場合、デフォルトの10が一般的な閾値です。",
    },
    DISABLED_PARAMETER,
  ],
  valueDescription: "16進数 dHash ハッシュ値（64文字）",
}
```

これだけで Monaco エディタの補完・シグネチャヘルプ・シンタックスハイライトが自動で有効になる（`ngDslMonaco.ts` は `NG_DSL_RULE_SPECS` から動的に生成するため）。

DSL 使用例：

```
SimilarImage(hash="0111011001110000011110010101101100110011000100110101101000111000", threshold=10)
SimilarImage(hash="a1b2c3d4e5f6a7b8", sites="5ch.net/livejupiter")
```

---

### 6. `src/core/NGMatcher.ts` 変更

`SimilarImage` はテキストマッチではなく画像ハッシュマッチのため、sync マッチングからは除外する：

```ts
// BOARD_ALLOWED_TYPES に SimilarImage は含めない（板一覧では画像ハッシュ比較は不要）
// THREAD_DENIED_TYPES に SimilarImage を追加（スレッド内でのテキストマッチから除外）

const BOARD_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  // ... 既存
  // SimilarImage は含めない（板一覧では非対応）
]);

const THREAD_DENIED_TYPES: ReadonlySet<string> = new Set([
  TYPE.HIGHLIGHT_TITLE,
  TYPE.REG_EXP_HIGHLIGHT_TITLE,
  TYPE.SIMILAR_IMAGE, // 追加：スレッド内でもテキストマッチからは除外
]);
```

---

### 7. `src/core/NG.ts` 変更

必要に応じて `SimilarImage` ルールを取得するユーティリティを追加：

```ts
export function getSimilarImageRules(): InternalNGElement[] {
  return Array.from(get()).filter((n) => n.type === TYPE.SIMILAR_IMAGE);
}
```

ただし、`similar-image-ng.ts` から直接 `container.ng.get()` を呼べるため、必須ではない。
拡張機能コンテキストでのみ使うので `container.ng` 経由でアクセスする。

---

### 8. `src/view/browser/pages/ThreadPage.tsx` 変更

```tsx
// 追加 import
import { useSimilarImageNg } from "src/view/browser/hooks/use-similar-image-ng";

// L250-253 付近を変更
const textBlurredResNums = useMemo(() => {
  if (!imageBlurConfig.enabled) return new Set<number>();
  return buildBlurredResSet(responses, indexes.repIndex, imageBlurConfig.harmfulWordPattern);
}, [imageBlurConfig, indexes.repIndex, responses]);

const similarImageBlurredResNums = useSimilarImageNg(responses, rootRef);

const blurredResNums = useMemo(
  () => new Set([...textBlurredResNums, ...similarImageBlurredResNums]),
  [textBlurredResNums, similarImageBlurredResNums],
);
```

---

## NG登録UI（将来タスク）

画像を右クリック →「類似画像NGに登録」で dHash を計算し DSL に追記するUI。
これは別タスクとして実装する。

```ts
// 右クリックメニュー拡張（イメージ）
async function registerSimilarImageNg(imageUrl: string) {
  const builder = new DifferenceHashBuilder();
  const dHash = await builder.build(new URL(imageUrl));
  const dslLine = `SimilarImage(hash="${dHash.toString()}")`;
  await container.ng.add(dslLine);
}
```

## 動作確認

1. NGエディタで `SimilarImage(hash="...", threshold=10)` を追加
2. スレッドを開き、該当画像がビューポートに入ると自動でぼかしが適用される
3. 既存の `image_blur` 設定（ぼかし有効/無効、ぼかし強度）が反映される
4. NG一時解除トグルでぼかしが解除される

## 制限事項

- 板一覧（スレッド一覧）では類似画像判定は行わない（負荷が高いため）
- 画像ホストがダウンしている場合、その画像の判定はスキップされる
- サムネイルではなく元画像URLに対してハッシュを計算する（精度のため）
