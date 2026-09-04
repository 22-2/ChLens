# 類似画像NG（実装仕様）

## 目的

NG登録した画像と視覚的に似た画像を含むレスを、レス本文全体ではなく既存のサムネイルぼかし表示で隠す。画像判定はスレッド表示時に必要な範囲だけ非同期で行い、既存のテキストNGや一時的なNG解除と干渉させない。

## ルール形式

現行のブロックDSLで、画像のdHashをcontains条件として登録する。

```text
blur similar-image contains threshold=10 sites=[bbs.eddibb.cc]:
  0123456789abcdef
```

- 動作は `blur`、対象は `similar-image` に固定する。
- `SimilarImage` は対象名の別名として受け付けるが、保存時は `similar-image` に正規化する。
- 条件値は64bitの二進表記、または16文字の16進表記を受け付ける。
- `threshold` はdHashのハミング距離で、未指定時は10、指定可能範囲は0〜64の整数とする。小さいほど厳密に一致する。
- `sites` は既存のNGルールと同じドメイン・板スコープを使う。
- `disabled=true`、期限切れ、対象外サイトのルールは判定しない。

画像を右クリックして登録するUIは今回の範囲外とし、NGエディタへdHash値を貼り付けて登録する。登録UIは、実際の利用手順とハッシュ値の取得元を人が確認した後の別タスクとする。

## 実装構成

```text
NG DSL / config
  ↓
packages/ch-lib/src/rules/{model,catalog,dsl}.ts
  ↓
src/core/NG.ts → src/service-container/setup.ts
  ↓
similar-image-ng.ts（ルール検証、URL抽出、dHash照合）
  ↓
use-similar-image-ng.ts（IntersectionObserver、キャッシュ、非同期状態）
  ↓
ThreadPage.tsx → ResItem / PopupRenderer の既存ぼかし経路
```

### dHash照合

`browser-image-hash` の `DifferenceHashBuilder` を使って画像URLごとに64bit dHashを計算する。画像URLはレス表示と同じ `extractUrlsFromMessage` / `toViewerImageUrl` の変換を通し、Imgurなど既存の画像表示形式にも揃える。

ルール読込時にハッシュ形式、threshold、動作・対象、サイト範囲を検証する。不正なルールや画像URL、画像取得・Canvas・CORS・タイムアウトの失敗は詳細をログへ出し、その画像またはルールだけをスキップして表示を継続する。ハッシュ計算には10秒の上限を設ける。

### 表示範囲と重複抑制

- `IntersectionObserver` の `rootMargin: "200px"` で表示直前のレスだけを評価する。
- `MutationObserver` で遅延描画されたレスも対象にする。
- レス番号と画像URL集合をキーにして、計算済み・処理中の重複を抑える。
- ルール、スレッド、画像URL集合が変わったときは世代番号を更新し、古いPromiseの結果を新しい表示へ混ぜない。
- 本文NGで置き換えた `.res--ng-placeholder` は観測せず、非表示レスの画像を取得しない。

## 既存機能との関係

- `image_blur` 設定が無効な場合は類似画像の計算も停止する。
- 一時的なNG解除中は類似画像によるぼかしを解除する。
- テキストNGは従来どおりレス単位で判定し、類似画像NGは画像ぼかし集合へだけ追加する。
- `PopupRenderer` にも同じ集合を渡すため、レス本文上の画像とポップアップ内の画像で表示状態を揃える。
- `similar-image` は板一覧や同期テキストマッチャーの対象に含めない。

## 自動確認

- ルールカタログ、別名、DSLの解析・整形・不正な組み合わせを確認する。
- NGサービスが類似画像ルールだけを分離して返し、本文NG判定へ混入しないことを確認する。
- 二進・16進ハッシュ、サイト範囲、threshold、無効ルールを確認する。
- 画像取得失敗後に次の画像を評価できること、距離超過を一致扱いしないことを確認する。
- hookが表示付近だけを一度評価し、設定無効時にObserverを登録しないことを確認する。

## 人による確認事項

1. NGエディタで上記DSLに実在画像のdHashを設定して保存できることを確認する。
2. `image_blur` を有効にして対象画像を含むスレッドを開き、レスを表示付近へスクロールしたときにサムネイルがぼけることを確認する。
3. 類似していない画像、動画URL、本文NGで置き換えたレスが誤って判定対象にならないことを確認する。
4. 一時的なNG解除、ルールの `disabled=true`、サイト範囲外のスレッドでぼかしが解除・停止することを確認する。
5. DevToolsのログとネットワークを確認し、取得失敗時もスレッド表示が継続し、表示範囲外の画像を一括取得していないことを確認する。

## 残存リスク

外部画像のCORS、拡張機能のhost permission、画像サイズによる通信量・CPU負荷は実行環境に依存する。dHashのthresholdは画像内容やリサイズ方法によって誤判定率が変わるため、初期値10を基準に実画像で調整する必要がある。画像の自動登録UIと最終的な利用手順は、人による確認後に別途仕様化する。
