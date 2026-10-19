# スレッド表示の仮想スクロール導入計画

## Context

ThreadPage（[ThreadPage.tsx:812-853](../../src/view/browser/pages/ThreadPage.tsx#L812-L853)）は `displayedResponses` を全件 `ResItem` で描画していて、非アクティブタブも `display:none` で DOM を全部持ち続けている（[TabView.tsx:155-176](../../src/view/browser/shell/TabView.tsx#L155-L176)）。レス数・タブ数に比例して描画負荷とメモリが増えるので、次の4つを入れる。

- 表示範囲だけを描く仮想スクロール（高さが変わるレスでもズレないこと）
- 非アクティブタブのレス一覧を umount して、戻ったときに位置を確実に復元すること
- 仮想化しても使える内製ページ内検索（Ctrl+F の置き換え。かなカナ・大小・全角半角を正規化）
- 上の挙動を e2e で数値として検証できるようにすること

決定事項（確認済み）: エンジンは内製、umount するのはレス一覧だけ、正規化はかなカナ＋大小＋全角半角、対象はスレッド表示だけ。

### 設計方針

下の方針は、可変高さの仮想リストで広く知られた一般的な手法と、このリポジトリの要件だけから組み立てる。

- 各項目の上端位置を高さの累積和として持ち、全体の高さもそこから決める。項目は絶対配置する（固定長の仮想リストで一般的な方式）。
- 表示範囲は累積和の配列を二分探索して求め、上下に余白（overscan、px単位）を付ける。
- レスへのジャンプは累積和から位置を求めて直接スクロールする。DOM を探さない。
- 選択中など、外せない項目は表示範囲の外でも描画したままにする（pinned）。
- 高さは「推定値 → 実測値のキャッシュ → 見えている先頭項目（アンカー）を基準にした位置補正」で合わせる。アンカーを基準に補正する考え方は、ブラウザ標準のスクロールアンカリング（CSS `overflow-anchor`）と同じ。ResBody は HTML が複雑で、完全な事前計算はしない。

## Phase 0: 準備

- `git fetch` してから `git worktree add V:\repos\forks\read.crx-2-virtual-scroll -b feat/thread-virtual-scroll origin/develop` で作る。node_modules は本体からリンクする（pnpm install はしない）。
- この計画を `docs/plans/thread-virtual-scroll-plan.md` としてリポジトリに置き、進捗のチェック欄を持たせる。

## Phase 1: 先に e2e の土台を作る（今の実装で通る特性テスト）

- [tests/localboard.mts](../../tests/localboard.mts) に、大きなスレッドを決定的に生成する関数を足す（例: 1000レス。1行・長文の折り返し・AA・改行の多いレス・画像URL・アンカーを混ぜる。画像は localboard から固定サイズの PNG を返す）。
- `tests/thread-virtual-scroll.spec.mts` を新設する。位置は「先頭に見えているレス番号＋ずれ量px」で比べる。
  1. 中ほどまでスクロール → 別タブへ切り替えて戻る → 同じレスが同じずれ量（±1px）で見えている
  2. 再読み込み・アプリ再起動後に既読位置が復元される
  3. 遠いレスへのアンカージャンプ・ミニマップクリックで、目的のレスが表示されてハイライトされる
  4. 自動更新で新着が来たとき、最下部にいれば追従し、途中にいればその位置が動かない
- この段階で通しておき、以降の Phase で壊れていないかの基準にする。

## Phase 2: 純粋なエンジン（DOM非依存・単体テスト中心）

置き場所は UI 部品層 `src/view/browser/utils/virtual-list/`。機能に依存しない汎用部品なので、features から使える。

- `layout.ts`: `buildLayout(keys, getSize, gap)` で offsets（Float64Array の累積和）と totalSize を作る。ほかに `findIndexAt(layout, y)`（二分探索）、`getVisibleRange(layout, scrollTop, viewportHeight, overscanPx, pinnedKeys)`（選択中などで外せない行を追加で含める）。
- `size-cache.ts`: key ごとの実測高さのキャッシュ。描画条件のシグネチャ（幅のバケット、miniAa、NG表示、ぼかしなど）が違えば無効にする。幅が変わったら実測値を捨て、旧値×幅比を推定値の材料として残す。キャッシュはタブ＋スレURL単位のモジュールストアに置き、umount しても残す。
- `anchor.ts`: `captureAnchor(layout, scrollTop, listTop)` → `{ key, offset }` または `{ kind: "bottom" }`（最下部から1px以内なら）。`resolveScrollTop(layout, anchor, listTop, viewportHeight)` で、補正後に設定すべき scrollTop を返す。
- `virtual-list-controller.ts`: 上の3つをまとめる状態機械。React と DOM には依存せず、「スクロール量と表示領域の高さ」「実測結果」「項目の並び」を入力として受け取り、「描画範囲」「補正後の scrollTop」「totalSize」を返す。
  - 実測で高さが変わったら layout を作り直し、アンカーの位置へ scrollTop を戻す（位置は常に layout から決まり、DOM の状態に左右されない）。
  - `scrollToKey(key, { align, offset })`: 推定位置へ移動したうえでアンカーをその key に固定する。描画・実測のあとにも同じ key の位置へ補正し、何フレームかけても目的のレスに収束させる。
  - 補正した回数と量を記録して、デバッグとe2eで見えるようにする。
- 単体テスト: 二分探索の境界、上方の行の高さ変化で scrollTop がちょうど差分だけ動くこと、bottom アンカーの維持、幅変更でのキャッシュ無効化、項目の追加・削除・フィルタ切替でアンカー key が消えたときの移り先（次に近い key）、pinnedKeys。

## Phase 3: 高さの安定化と React アダプタ

- 描画後に高さが変わる要因を潰す（ズレの主因になる）。
  - [ThreadResponse.css:6-7](../../src/view/browser/styles/pages/thread/ThreadResponse.css#L6-L7) の `content-visibility:auto` / `contain-intrinsic-size` は実測を狂わせるので、仮想化したリストでは外す。
  - サムネイル・埋め込みは、読み込み前から枠のサイズを固定（aspect-ratio と固定高さ）する。値は既存の tokens を使う。
- 推定値: `src/features/thread/domain/res-height-estimate.ts`。本文のテキストを `<br>` で行に分け、行ごとの文字幅を見積もって折り返し行数を出し、ヘッダ行・メディア行・AA を足す。フォント指標は、隠しプローブ要素で一度だけ測った値（1em幅・行の高さ）を受け取る純粋関数にする。
- `src/view/browser/hooks/use-virtual-list.ts`: controller を保持する。scroll（passive）と ResizeObserver（1つを全行で共有）を controller へ渡し、補正後の scrollTop を `useLayoutEffect` で反映する。高さ0の実測（display:none中）は無視する。
- `src/features/thread/ui/VirtualResList.tsx`: 全体の高さを持つ箱の中に、各行を `transform: translateY(offset)` で絶対配置する。行は `data-res-num` を持つ要素で包み、ResizeObserver で測る。ArchiveReplayPositionLine は通常の項目（separator）として並びに入れる。

## Phase 4: ThreadPage への組み込み（DOM依存箇所の置き換え）

`src/features/thread/browser/use-thread-virtual-list.ts` に、ThreadPage 用の key・推定値・pinned（選択中のレス、ライブ実況の入場アニメ中のレス）をまとめる。controller はスレッドルートに紐付けた参照として公開し、次の利用箇所を DOM 探索から layout 参照へ移す。

| 箇所 | 今 | 移行後 |
|---|---|---|
| [thread-read-state.ts](../../src/view/browser/utils/thread-read-state.ts) `scrollThreadToResponse` | DOM の `[data-res-num]` を探す | `controller.scrollToKey`。ハイライトは「マウントされたら付ける」待ち状態にする |
| 同 `measureThreadReadState` | 全レス要素の rect を走査 | layout から先頭・末尾の可視レスと offset を計算する純粋関数 |
| [use-thread-read-state.ts:169-177](../../src/view/browser/pages/thread/use-thread-read-state.ts#L169-L177) MutationObserver で再試行 | DOM に現れるのを待つ | 項目の並びに key が現れたら実行 |
| [ThreadMinimap.tsx](../../src/features/thread/ui/ThreadMinimap.tsx) マーカー位置 | 全レス要素を querySelectorAll | `controller.getOffset(resNum)` / totalSize |
| [use-auto-follow-scroll.ts](../../src/features/auto-refresh/browser/use-auto-follow-scroll.ts) | scrollHeight 基準 | そのまま使う。追従中は bottom アンカーにして、新着の実測で底から離れないようにする |
| [use-thread-data.ts:151-176](../../src/features/thread/browser/use-thread-data.ts#L151-L176) 選択の保持 | DOM 選択を復元 | 選択を含むレスを pinned にして umount させない |
| ResItem の `animateEntry` | マウントのたびに判定 | 入場済みの集合を外に持ち、スクロールで再マウントしても再生しない |

ThreadScrollFloatingActions・use-thread-top-scroll-open-filter・ポップアップ（resMap 参照）は scrollTop / scrollHeight / データだけを使うので、変更不要の見込み（Phase 1 の e2e で確認する）。

## Phase 5: 非アクティブタブでの umount と位置の復元

- ThreadPage のデータ・自動更新・実況・次スレ探索の hook は残す。`isActive=false` のときは VirtualResList とミニマップだけ描画しない。
- アンカー（key＋offset）はスクロールのたびに更新して、タブ＋ページ単位のストアに置く。display:none になった瞬間に測ろうとしない（rect が0になるため）。サイズキャッシュも同じストアに残す。
- 再表示時は `useLayoutEffect` で、キャッシュ済みの高さから layout を作り、描画前に scrollTop をアンカーへ合わせる。そのあとの実測差分も同じアンカーで補正する。
- 既読状態の保存（readState）は今の経路のまま使い、計測元だけを layout に替える。別窓へ切り離したとき（DetachedTabWindowContent）も同じストアから復元する。

## Phase 6: 内製ページ内検索（Ctrl+F）

- 正規化: [search-normalize.ts](../../src/view/browser/utils/search-normalize.ts) の `normalizeSearchCharacter` に、1文字ずつの NFKC（全角半角）を足す。半角カナと濁点・半濁点（ｶﾞ）は2文字を1文字に合成して扱う。`normalizeWithOffsets`（[search-highlight.ts](../../src/view/browser/utils/search-highlight.ts)）を、1文字→複数文字・複数文字→1文字の両方に対応させる。既存のフィルタ検索も同じ正規化になる（判定を揃えるため）。
- `src/features/thread/domain/thread-find.ts`: 表示中の項目（displayedResponses）から、名前・ID・本文（stripHtml）を正規化した索引を作る。`findMatches(query)` → `{ resNum, occurrence }[]`、`next/prev`（端で折り返す）。純粋関数として単体テストする。
- `src/features/thread/browser/use-thread-find.ts`: アクティブなスレッドで Ctrl+F（Tauri版も）を `preventDefault` して検索バーを開く。Enter / Shift+Enter / F3 で移動、Esc で閉じる。現在の一致へは `controller.scrollToKey(resNum, { align: "center" })` で移動する。
- `src/features/thread/ui/ThreadFindBar.tsx`: 入力欄、「n / m 件」、前へ・次へ、閉じる。sticky header の中に置く。
- ResItem / ResBody は `highlightSearchMatches` に「現在の一致の occurrence」オプションを足して描き分ける（`res__find-match` と `--current`）。フィルタ検索の `res__search-match` とは別のクラスにする。

## Phase 7: デバッグ手段と e2e の拡充

- `registerDebugStateProvider("virtual-list:<tabId>", …)` で、描画範囲・アンカー・totalSize・補正回数・最後の補正量・キャッシュのヒット率を公開する。補正は `recordDebugEvent` に残す。e2e は `window.__chlensDebug.state()` を読んで検証する。
- Phase 1 の spec に次を追加する。
  - 1000レスで `.res` の DOM 数が上限（例: 80）以下であること。非アクティブタブでは0であること
  - 未実測の範囲を上へ wheel で少しずつスクロールしたとき、基準要素の rect.top が毎回 wheel の量どおりに動くこと（±1px。ズレの直接検出）
  - ウィンドウ幅の変更、フィルタの開閉・切替、ポップアップの開閉をしても、アンカーのレスとずれ量が保たれること
  - Ctrl+F で、カタカナ・半角カナ・全角英字で入力してもひらがな・半角英字の本文に一致し、件数が出ること。描画範囲外の一致へ Enter で移動して、そのレスが表示されて現在一致のハイライトが付くこと
- Tauri 版は `pnpm run test:e2e:tauri` で、タブ切替の復元と Ctrl+F の差し替えだけを確認する。

## 主な新規・変更ファイル

- 新規: `src/view/browser/utils/virtual-list/{layout,size-cache,anchor,virtual-list-controller}.ts`（＋test）、`src/view/browser/hooks/use-virtual-list.ts`、`src/features/thread/ui/VirtualResList.tsx`、`src/features/thread/ui/ThreadFindBar.tsx`、`src/features/thread/browser/{use-thread-virtual-list,use-thread-find}.ts`、`src/features/thread/domain/{res-height-estimate,thread-find}.ts`、`tests/thread-virtual-scroll.spec.mts`
- 変更: `ThreadPage.tsx`、`thread-read-state.ts`、`use-thread-read-state.ts`、`ThreadMinimap.tsx`、`use-auto-follow-scroll.ts`、`use-thread-data.ts`、`ResItem.tsx` / `ResBody.tsx`、`search-normalize.ts` / `search-highlight.ts`、`ThreadResponse.css`、`tests/localboard.mts`
- 他の機能から新しく import するファイルは `vite.config.ts` の `FEATURE_PUBLIC_MODULES` に追加する。

## 検証

- 各 Phase で `vp check` と `vp test` を通す。
- `pnpm run test:e2e`（Chrome）で `tests/thread-virtual-scroll.spec.mts` と既存の spec 全部を通す。最後に `pnpm run test:e2e:tauri` も通す。
- 性能: 1000レスのスレを開いたときの描画時間と、タブを10枚開いたときのヒープを、導入前後で比べて記録する（e2e で `performance.now` と `performance.memory` を使う）。
- Tauri 実機での確認には chlens-tauri-debug スキル（`pnpm debug:tauri`）で virtual-list のデバッグ状態を見る。

## リスク

- ResBody の後から変わる高さ（遅延展開・AA縮小の切替）: 実測と補正で吸収する。e2e のズレ検出で確認する。
- 選択を含むレスより外側へ大きくスクロールすると、範囲選択が切れる（pinned にするのは起点と終点のレスだけ）。この制限は受け入れる。
- フィルタ検索の正規化が変わるので、全角半角を区別した検索結果は増える。既存の thread-search のテストを更新する。

## 進捗

- [x] Phase 0
- [ ] Phase 1
- [ ] Phase 2
- [ ] Phase 3
- [ ] Phase 4
- [ ] Phase 5
- [ ] Phase 6
- [ ] Phase 7
