# 類似画像NG 実装計画

## 1. 目的と範囲

NGに登録した画像と見た目が似ている画像を、サムネイルのぼかしで隠す。
レスそのものは消さず、既存のぼかし（`res__thumb--blurred`）を同じ見た目で使う。

- 判定には64bitの差分ハッシュ（dHash）とハミング距離を使う。
- ルールは既存のNG DSL（`hide:` / `when ... contains ...` 形式）に、新しい動作と対象を足して書く。
- 登録は画像の右クリックメニューから行う。ハッシュを手で書かせない。

### 範囲外

- スレ一覧（板）での判定。サムネイルを表示しないため対象にしない。
- 画像を理由にレスを非表示・折りたたみにすること。最初は `blur` だけを扱う。
- 本文の語句でぼかす既存の `image_blur_word` の置き換え。そのまま残す。
- ハッシュの永続キャッシュ（IndexedDB）。必要になったら別に行う（§8）。

## 2. 前提として確認した現状

| 項目           | 現状                                                                                                                                                                                                                                         | 計画への影響                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| NGルールの定義 | `packages/chlib/src/rules/`（`model.ts`・`catalog.ts`・`dsl.peggy`・`dsl.ts`・`engine.ts`・`validator.ts`・`editor.ts`）が正。`src/core/ng/rules/` はその薄い facade                                                                          | 構文・型・判定は chlib に足す                                                                                      |
| DSLの形        | 動作を見出しにし、`when <対象> <演算子> <値>` と設定行（`sites`・`label` など）を並べる                                                                                                                                                       | `blur:` と `when image similar` を足す                                                                             |
| 判定エンジン   | `matchRules` は同期処理で、最初に一致した1件だけを返す。レスに使える動作は `RESPONSE_RULE_ACTIONS`（`hide`・`collapse`）                                                                                                                     | `blur` を既存の判定に混ぜると `hide` と取り合いになる。画像の判定は別関数にする                                    |
| ぼかしの単位   | `ThreadPage` の `blurredResNums`（レス番号の Set）を `ResItem` → `ResMediaGallery` の `isBlurred` に渡す。ポップアップと画像一覧（`useThreadSnapshotPublisher`）も同じ Set を使う                                                             | 結果をこの Set に合流させれば、全部の表示面でそろう                                                                |
| スレの描画     | `features/thread/browser/use-thread-virtual-list.ts`（`@tanstack/react-virtual`）で、見えている範囲だけを描画する                                                                                                                             | DOM を一度だけ監視する方式は使えない。サムネが読み込まれた時点で判定する                                           |
| 画像の読み込み | `features/media/ui/ExternalImage.tsx` は通常の `<img>`。Tauri版では失敗したときだけ `fetchTauriBinary` で取り直した blob URL へ切り替える。状態は `browser/use-media-image-store.ts`（zustand）で表示面をまたいで共有する                    | 表示した画像からハッシュを取る。取り直しは代わりの手段として使う                                                   |
| NG変更の通知   | `NG.ts` の `commitRules` が保存後に `ng_changed` を送る。`INGService` にはルールを読む API がない                                                                                                                                            | 画像ルールを読む API と変更の購読を足す                                                                            |
| 機能間の依存   | `media` と `ng` は互いに import していない。公開モジュールは `vite.config.ts` の `FEATURE_PUBLIC_MODULES`                                                                                                                                    | `ng → media` の一方向だけにする（§4）                                                                              |

## 3. DSL

```text
blur:
  label "類似画像"
  distance 10
  when image similar:
    "c3e1f0d8a4b29617"
    "0f1e2d3c4b5a6978"
  unless id contains "許可ID"
```

- 動作 `blur`: 一致したレスのサムネイルをぼかす。最初は「`when image similar` をちょうど1つ含むルール」だけで使える。本文などの条件だけの `blur` は検証エラーにする。
- 対象 `image`: 演算子 `similar` だけを受け付ける。`unless image` と正規表現は使えない。
- 値: 16進16桁（64bit）。大文字・小文字を区別せず、小文字にそろえて保存する。
- 設定行 `distance`: 許容するハミング距離（0〜32、既定は10）。ルール内のすべてのハッシュに使う。
- `sites`・`label`・`disabled`・有効期限は、既存のルールと同じように扱う。
- 本文などの条件（`when` / `unless`）を一緒に書くと AND になる。画像以外の条件はレス単位で同期的に判定し、画像の比較はその条件を満たしたレスだけで行う。

### ハッシュの仕様（保存値なので固定する）

ハッシュは利用者の設定に保存されるので、計算方法を変えると既存のルールが効かなくなる。そこで手順を固定し、テストで具体的な値を確かめる。

1. 画像を 72×64 の canvas に描く（透過部分は白で塗る。アニメーション画像は最初のフレームを使う）。
2. 輝度 `0.299R + 0.587G + 0.114B` を 8×8 のブロックごとに平均し、9×8 にする。ブラウザによる縮小処理の違いを小さくするため、最後の縮小は JS で行う。
3. 各行で左が右より明るければ1を立てる（上の行から、左から右の順）。64bit を16進16桁で表す。

将来ほかの方式（pHash など）を足すときは、`similar` の意味を変えずに別の演算子を足す。

## 4. 構成

```text
packages/chlib/src/rules/           … 構文・型・検証・比較（純粋関数、DOMなし）
  model.ts      RuleAction に blur、RuleTarget に image、RuleMatcher に image-hash
  dsl.peggy     NgConditionLine の演算子に similar（生成: generate:dsl）
  dsl.ts        similar の解析、distance 設定行、formatRuleDsl での書き戻し
  validator.ts  blur・image の組み合わせ制約、16進16桁と distance の範囲の検査
  catalog.ts    blur・image の説明（補完・ホバーに出る）
  engine.ts     evaluateImageRules（下記）、条件判定を matchRules と共通化
  image-hash.ts hammingDistance64、正規化（16進の検査）

src/features/media/                 … 画像からハッシュを作り、URL ごとに持つ（ng を知らない）
  domain/image-dhash.ts             ピクセル配列 → dHash（純粋関数、§3の手順2〜3）
  browser/image-hash-reader.ts      <img> / Blob → ピクセル配列（canvas）。読めなければ取り直す
  browser/use-image-hash-store.ts   key(rawUrl) → { status, hash } と hashingEnabled
  ui/ResMediaGallery.tsx            読み込み完了でハッシュ計算を依頼し、判定待ちの間はぼかす

src/features/ng/                    … ルールとハッシュを照らし合わせる（media の公開モジュールを使う）
  browser/use-similar-image-ng.ts   画像ルールの購読、hashingEnabled の切り替え、ぼかすレスの Set

src/view/browser/pages/ThreadPage.tsx … 既存の blurredResNums と合流させる
```

### 判定の流れ

```text
ResMediaGallery（画像を表示）
  └ onLoad → imageHashStore.request(rawUrl, imgElement)
        └ image-hash-reader → image-dhash → store に { status: "ready", hash }

useSimilarImageNg(responses)                         … ng
  ├ 画像ルール = container.ng.getImageRules()（ng_changed で読み直す）
  ├ hashingEnabled = 画像ルールがある && NG一時解除中でない → store に設定
  └ レスごとに evaluateImageRules(rules, レスの文脈, そのレスの画像のハッシュ)
        → 一致したレス番号の Set

ThreadPage
  └ blurredResNums = 本文語句によるぼかし ∪ 類似画像NG
```

- `evaluateImageRules(rules, context, hashes)` は chlib の純粋関数。`blur` かつ `image` を含むルールだけを見て、画像以外の条件は `matchRules` と同じ処理で判定する。`hide` などの判定（`evaluateResponseRules`）には手を入れないので、既存のNGの結果は変わらない。
- ハッシュは URL ごとに持ち、判定結果は持たない。ルールが変わっても比較し直すだけで済み、画像の再取得や再計算は起きない。
- 依存は `ng → media` の一方向にする。`media` の `browser/use-image-hash-store` を `FEATURE_PUBLIC_MODULES` に足す。`ResMediaGallery` は「ハッシュが必要かどうか」を store の `hashingEnabled` で知るので、NGのルールを知らなくてよい。

### 判定前の表示（一瞬見えてしまう問題）

判定は非同期なので、何もしないとNG画像が一瞬見えてしまう。次のようにして防ぐ。

- `hashingEnabled` が真のとき、`ResMediaGallery` はハッシュが `ready` になっていない画像にぼかしを掛けておく（`res__thumb--blurred` を使い、判定待ちを示す修飾子を足す）。
- 判定でNGでなければ、ぼかしを外す。ハッシュの計算に失敗した画像もぼかしを外す。NG判定のために、普通の画像まで見えなくするのは避ける。失敗はログに出す。
- 画像ルールが1件もなければ `hashingEnabled` は偽で、表示もコストも今と変わらない。

### ピクセルの読み取り

1. 表示した `<img>` を canvas に描いて `getImageData` で読む（再取得しない）。
2. 別オリジンの画像で canvas が汚染されて `SecurityError` になったら、画像のバイト列を取り直し、`createImageBitmap(blob)` で読む。
   - 拡張機能: `host_permissions`（`http://*/`・`https://*/`）があるので、`fetch` でよい。HTTPキャッシュに当たることを期待する。
   - Tauri: `src/app/platform/` のHTTP（`fetchTauriBinary`）を通す。`ExternalImage` が blob URL へ切り替え済みなら、それを使う。
3. どちらも失敗したら `status: "error"` にして、ログに URL と原因を出す。

1で読めるかどうかは Chrome・Firefox・Tauri（WebView2）で違う可能性がある。フェーズ0で確かめ、2を常に使うかどうかを決める。

## 5. 登録UI

- サムネイルの右クリックメニュー（`ResMediaGallery` の `openImageContextMenu`）と、メディアビューア（`MediaViewer.tsx`）の右クリックメニューに「類似画像NGに登録」を足す。画像が読み込み済みのときだけ表示する。
- 選ぶと、ハッシュを store から取り出し（なければその場で計算し）、次の DSL を `container.ng.add` で末尾に足す。

  ```text
  blur:
    label "類似画像"
    when image similar "c3e1f0d8a4b29617"
  ```

- 登録したことと、取り消し方（NGエディタで消す）を通知で伝える。同じハッシュがすでにあれば、追加せずにそう伝える。
- メニューは `media` にあり、登録は `ng` の処理になる。依存の向きを守るため、`media` はメニュー項目を外から受け取る口（`extraImageMenuItems` などの props か、登録関数）だけを持ち、組み立て層が `ng` の登録処理を渡す。

## 6. 段階と完了条件

| 段階 | 内容                                                                                                                         | 完了条件                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0    | 試作: 各環境で別オリジンの `<img>` から `getImageData` できるか、縮小の違いでハッシュがどれだけずれるかを確かめる          | 確かめた結果をこの計画の §4「ピクセルの読み取り」に書き込み、取り直しを常に使うかを決める |
| 1    | chlib: `blur`・`image`・`similar`・`distance` の構文、検証、書き戻し、`evaluateImageRules`、`hammingDistance64`              | DSL の往復・検証エラー・判定のユニットテストが通る。既存の NG テストが変わらず通る          |
| 2    | media: `image-dhash`（具体的な値で確かめるテスト）、`image-hash-reader`、`use-image-hash-store`、判定待ちのぼかし           | 同じ画像を縮小・再圧縮しても距離が閾値以内、別の画像は閾値を超える、というテストが通る     |
| 3    | ng と組み立て: `INGService.getImageRules`、`use-similar-image-ng`、`ThreadPage` での合流                                    | ルールを足す・消す・一時解除すると、表示中のサムネイルにすぐ反映される                     |
| 4    | 登録UI（§5）                                                                                                                 | 右クリックから登録すると、同じ画像と再圧縮した画像がぼかされる                             |
| 5    | Monaco の補完・ホバー（`editor.ts` / `ngDslMonaco.ts`）の確認と、E2E                                                         | 下の「動作確認」が Chrome と Tauri で通る                                                    |

各段階は単独でコミットできる大きさにする。段階1〜2は表示に影響しない。

## 7. テストと動作確認

- ユニット（chlib）: DSL の解析と書き戻し、`blur` の組み合わせ制約、16進の検査、`distance` の範囲、`sites`・`unless` との AND、`hide` の判定に影響しないこと。
- ユニット（media）: 固定のピクセル配列から期待どおりのハッシュになること、透過、1×1 や極端に横長の画像、読み取りに失敗したときに `error` になりログが出ること。
- フック: ルールの変更（`ng_changed`）で比較し直し、ハッシュは計算し直さないこと。仮想スクロールで後から描画されたレスも判定されること。
- E2E（Playwright）: テスト用の画像を `example.com` のダミーURLとして用意し、登録 → 再読み込み → ぼかされることを確かめる。実在のスレや画像の URL は使わない。

動作確認の手順:

1. 画像の右クリックから「類似画像NGに登録」を選ぶ。
2. 同じ画像や縮小・再圧縮した画像を貼ったレスで、サムネイルがぼかされる。判定の前に一瞬でも見えないこと。
3. 似ていない画像はぼかされない。
4. NGの一時解除でぼかしが外れ、戻すと再びぼかされる。
5. NGエディタでルールを消すと、表示中のサムネイルのぼかしがすぐに外れる。
6. ポップアップと画像一覧でも、同じレスがぼかされる。
7. 画像ルールが1件もないときは、画像の読み込みと表示が今と変わらない。

## 8. 未決事項・リスク

- **ぼかしの単位**: 既存の仕組みに合わせて、レスの画像すべてをぼかす。1枚だけNGの画像があるレスで、ほかの画像まで隠れる。画像ごとにぼかすには `ResItem` やポップアップへ画像単位の情報を渡す必要があり、最初の範囲からは外す。
- **閾値**: 既定の10は仮の値。単色やグラデーションの画像は、似ていなくても距離が近くなりやすい。フェーズ0〜2の実測で決め直し、ほぼ単色の画像は登録時に警告する。
- **`image_blur` 設定との関係**: 類似画像NGはNGの一部として扱い、`image_blur`（本文の語句によるぼかし）の有効・無効には従わない。NGの一時解除とルールの `disabled` には従う。ぼかしの強さは同じ値（`IMAGE_BLUR_RADIUS_PX`）を使う。
- **コスト**: 画像1枚につき 72×64 の描画と読み取りが1回。取り直しが必要な環境では通信も増える。重ければ、`requestIdleCallback` で順番に処理するようにする。
- **キャッシュ**: ハッシュはセッション内のメモリだけに持つ（URL をキーにし、上限を設けて古いものから捨てる）。再起動のたびに計算し直すのが重ければ、IndexedDB への保存を別に検討する。
- **元画像とサムネイルの違い**: 登録はビューアの元画像から、判定はサムネイルから行うことがある。dHash は縮小の影響を受けにくいが、切り抜きの違いには弱い。画像ホストごとのサムネイルの違いは、フェーズ0で確かめる。
