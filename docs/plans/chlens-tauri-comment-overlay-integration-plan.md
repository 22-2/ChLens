# ChLens Tauri コメントオーバーレイ統合計画

## この文書の位置づけ

この文書を、コメント流し機能に関する現在の実装計画とする。

従来の[Chlens Live 開発ロードマップ](./chlens-live-development-roadmap.md)は削除しない。同文書には、
コメント速度、レーン管理、キュー制御、透明Overlay、Live Sessionなど、今後も参照する技術検討が
含まれているためである。ただし、「Chlens Liveを独立した掲示板クライアントとして完成させる」
という製品境界は、この文書で置き換える。

既存のPhase spike文書も、実装済みの境界と検証結果を確認する記録として残す。

## 現在の進捗（2026-08-30）

- Phase 0：完了。独立したChlens Live開発を凍結し、本書を現行計画として扱う方針を旧ロードマップへ明記した。
- Phase 1：実装済み。コメント入力型、HTMLからのprojection、baselineとの差分抽出、NG・空本文・重複排除、memory event busを実装済み。
- Phase 2：実装済み。ChLens TauriへOverlay用entry、初期非表示のnative window、capability、geometry保存、クリック透過、カーソル位置command、Tauri event adapterを追加した。native windowのgeometry変換、監視、表示・非表示に伴うcursor pollingのライフサイクルもテストで固定した。
- Phase 3：実装済み。ThreadPageの確定済み`IRes[]`をcontrollerへ同期し、Tauri版スレッドのステータスバーから実況開始・停止とOverlay表示切り替えを行えるようにした。MVPではアクティブなスレッドだけを実況対象とする。
- Phase 4：実装済み。動的lane、adaptive/dropを既定とする新着優先queue、CSS animation、hover情報、固定レス・過去ログ・現行スレ・StressのStoryを実装した。
- Phase 5：実装済み。Tauri限定の開始・停止・表示切り替えUI、表示中スレッドを離れた際の停止、速度・文字サイズ・透明度・最大queue数の設定保存と実況開始時の反映、開始失敗時の非表示ロールバックとエラー表示、実行中Overlayへの設定変更即時反映まで追加した。
- 自動確認：`pnpm tsc6`、`pnpm build:chrome`、`pnpm build:firefox`、`pnpm build:tauri`、`pnpm tauri build --debug --no-bundle`、`cargo check --manifest-path src-tauri/Cargo.toml --all-targets`、Overlay関連テスト、geometry保存・復元テスト、Tauri event adapter契約テスト、Tauri window adapter lifecycleテスト、Config購読テスト、Overlay操作バー契約テスト、dat落ち時の実況停止テスト、`pnpm storybook:build`、`pnpm tauri dev`のwatcherとTauriプロセス起動は成功。直近のコメントOverlay・Tauri限定UI・設定テストは84件全件成功している。全体テストは658件中657件成功し、変更箇所外の`ResItem`状態クラス期待値1件だけが失敗している。
- 未確認：Windows実機での新着レス表示と設定反映、クリック透過、複数モニター/DPI、Overlay操作バーとリサイズ領域、長時間動作の手動確認。

## 背景と判断

Chlens Liveを独立アプリとして完成させる場合、ChLensに既にある次の機能を移植し、以後も両製品で
同期し続ける必要がある。

- タブ、ペイン、ナビゲーション、ステータスバー
- スレ一覧、スレ表示、検索、絞り込み
- NG、ハイライト、ポップアップ
- 書き込み、自分のレス、返信強調
- 履歴、ログ、設定、自動更新、自動次スレ

目的の中心が「Tauri版ChLensで、閲覧中の実況スレの新着レスを透明Overlayへ流すこと」であるなら、
これらを再実装する費用に対して独立アプリの利点が小さい。

そこで、Chlens Liveの独立クライアント開発を凍結し、検証済みのOverlay・イベント・session境界を
ChLens本体へ回収する。最終成果物は、ブラウザ版へ影響しないTauri限定機能とする。

## 目的

- ChLensのTauri版で、スレの新着レスを透明な常時最前面ウィンドウへ表示する。
- スレ一覧、スレ表示、NG、設定、履歴、書き込みなどは既存ChLensをそのまま利用する。
- コメント表示のために、同じスレを別経路で重複取得しない。
- Chrome版とFirefox版のUI、bundle、動作を変更しない。
- Chlens Liveで検証したコードを、責務単位で安全に回収する。

## 非目標

- Chlens Liveを独立した掲示板クライアントとして完成させること。
- ChLensのスレ一覧やスレ表示をOverlay用に作り直すこと。
- 初期MVPで過去ログ再生、上固定、下固定、複数実況セッションを完成させること。
- コメント流しのためにChLensと別の設定DB、履歴DB、NGルールを持つこと。
- 移植完了前に`apps/chlens-live`を削除すること。

## 目標構成

```text
ChLens
├─ Browser版
│  └─ 従来のChLens機能のみ
└─ Tauri版
   ├─ 通常のChLensメインウィンドウ
   ├─ コメント実況の開始・停止UI
   └─ 透明コメントオーバーレイ
```

コード上は、コメントの抽出・スケジューリングとTauriのウィンドウ操作を分離する。

```text
src/features/comment-overlay/
├─ domain/       # 差分抽出、表示用projection、lane、queue、clock
├─ application/  # 実況対象、開始・停止、Overlayへのevent送信
├─ platform/     # Tauri portとbrowser/no-op adapter
└─ ui/           # ChLensメイン画面側の操作UI

src/view/comment-overlay/
├─ index.tsx     # Overlay frontend entry
├─ OverlayApp.tsx
└─ styles/

src-tauri/
└─ ChLens本体とOverlayのnative window定義・command
```

ディレクトリ名は実装時に既存構成へ合わせて調整してよいが、domainからTauri APIやReactを参照しない
依存方向は維持する。

## データフロー

MVPではChLensの既存取得結果を唯一の取得元とする。

```text
ThreadPage / useThreadData
          │
          │ 取得済みIRes[]
          ▼
CommentOverlayController
          │
          ├─ 実況対象URLとの照合
          ├─ 最終送信レス番号との比較
          ├─ NG・本文・重複のprojection
          └─ 新着batchだけ生成
          │
          ▼
Tauri app event
          │
          ▼
Overlay CommentScheduler
          │
          ├─ queue
          ├─ lane allocator
          └─ animation clock
```

OverlayはHTTP取得、dat解析、NG判定を行わない。メインウィンドウが作った表示用イベントだけを受け取る。

## StorybookによるOverlay検証

コメント描画は透明なTauriウィンドウへ移植する前に、Storybookで不透明なステージとして確認する。
StorybookはNative windowの挙動を検証する場所ではなく、コメントが意図した速度・位置・レーンで流れるかを
繰り返し調整するための開発用の表示環境とする。

### OverlayStageの分離

Tauriの表示・非表示、クリック透過、移動、リサイズを担当する`OverlayApp`と、コメントの描画だけを担当する
props駆動の`OverlayStage`を分ける。

```text
OverlayApp
├─ OverlayWindowChrome   # Tauri専用のnative window操作
└─ OverlayStage           # Storybookでも直接描画するコメント表示
```

`OverlayStage`はコメント配列、scheduler状態、表示設定を受け取り、Tauri APIを参照しない。
Storybookでは透過を無効にし、背景色のある固定サイズのステージへ描画する。

### 必須Story

- `Hardcoded`: 固定レス、短文、長文、改行、URL、絵文字、大量投入を確認する。
- `PastThreadReplay`: 保存した過去スレの`IRes[]`を再生し、速度変更、停止、再開、開始位置を確認する。
- `CurrentThread`: 指定した1つのthread URLだけを一定間隔で取得し、新着レスだけを流す。自動次スレ移動は行わない。
- `Stress`: 大量投入、長文連続、queue上限、skip、stage幅変更を確認する。

### StorybookのControls

次の値はControlsから変更できるようにする。

- ステージ幅・高さ
- 速度、レーンの行高・最大容量、文字サイズ
- コメント投入間隔とqueue上限
- 背景色とコメントの透明度
- 再生、停止、リセット、1レス追加

過去スレStoryはネットワークに依存しないfixtureを使う。現行スレStoryは手動確認用とし、固定URLを
pollingするだけで、Storybookのbuildや自動テストがネットワーク状態に左右されないようにする。

### StorybookとTauriの確認範囲

Storybookでは速度、衝突、レーン、queue、長文、resizeを確認する。透過、常に手前、クリック透過、
複数モニター、DPI、OSウィンドウ操作はTauri実機確認の対象とする。

## 主要な設計判断

### Tauri限定境界

- 操作UIは`isTauriRuntime()`が真のときだけ表示する。
- Tauri APIはplatform adapterの内側に閉じ込める。
- domainテストはTauri runtimeなしで実行可能にする。
- Chrome／Firefox向けコードからOverlayウィンドウを生成しない。

### 実況対象と表示中タブ

- 開始操作を行ったスレURLを実況対象として固定する。
- 同じタブで再取得されても、既に送信したレスは流さない。
- MVPでは実況対象のThreadPageが取得した結果だけを利用する。
- タブ移動後も独立pollingを継続する機能はMVP後に判断する。
- 独立pollingが必要になった場合は、ChLensの取得元と共有できるsessionへ昇格し、二重取得を避ける。

### 開始・停止時の扱い

- 開始時点の最終レス番号をbaselineにし、過去レスを一斉に流さない。
- 停止中に到着したレスを再開時に流すかは設定化せず、MVPでは再開時点を新しいbaselineにする。
- スレURLが変わった場合は、古いbaselineとqueueを引き継がない。
- 取得結果がキャッシュから再描画されても、レス番号で重複を除外する。

### コメントへのprojection

- レス本文のHTMLをそのままOverlayへ渡さず、安全なプレーンテキストへ変換する。
- NGレスは既存ChLensの判定結果を利用し、初期値では表示しない。
- 名前、ID、レス番号などの付加情報は、MVPでは本文と分離した型に保持する。
- event payloadは全スナップショットではなく、新着コメントbatchを基本とする。

### コメント速度とレーン

速度、レーン割り当て、混雑時の方針は旧ロードマップの
[Overlayの速度・レーン方針](./chlens-live-development-roadmap.md#overlay-の速度レーン方針)を引き継ぐ。

- 速度はpx/secで管理する。
- 初期値はDPlayerデモ風に900px幅を約10秒で通過する`90px/sec`を基準に実機調整する。
- コメントごとに途中で速度を変更しない。
- queue上限、古いコメントのskip、遅延表示を組み合わせる。
- 初期MVPは右から左へ流れる通常コメントだけとする。

## 既存資産の分類

### そのまま維持するもの

- `packages/ch-lib`のURL、取得、parser、板名Resolver
- ChLensのThreadPage、ThreadList、NG、設定、履歴、書き込み
- ChLens本体のTauri HTTP、SQLite、platform runtime
- Chlens LiveのPhase spike文書と旧ロードマップ

### ChLensへ回収する候補

- `apps/chlens-live/src/app/OverlayApp.tsx`
- `apps/chlens-live/src/app/OverlayControlBar.tsx`
- `apps/chlens-live/src/platform/types.ts`
- `apps/chlens-live/src/platform/geometry.ts`
- `apps/chlens-live/src/platform/tauri.ts`
- `apps/chlens-live/src/live-session/events.ts`のserializable event境界
- `apps/chlens-live/src/live-session/tauri-events.ts`
- `apps/chlens-live/src-tauri/src/lib.rs`のOverlay用commandと起動時設定
- Overlay関連CSSとテスト

回収時はファイルをそのままコピーせず、`Chlens Live`という製品名やboard snapshotなど、独立アプリ固有の
責務を除去する。

### MVPでは回収しないもの

- `LiveBrowserShell`
- `LiveThreadList`、`ThreadView`、`LiveResponse`
- Live専用タブ管理とURLバー
- `use-live-sessions`
- `use-thread-list-controller`
- Live専用board session、rule repository、history、cache
- Live専用Tauri bundle全体

### 後から再評価するもの

- `LiveThreadSession`
- `LiveSessionOwner`
- playback session

これらは、表示中タブから独立した実況継続や過去ログ再生が必要になった時点で、ChLensの取得処理との
二重化を避ける形へ再設計してから回収する。

## 実施フェーズ

### Phase 0：方針と既存状態の固定

#### 作業

- この文書を現行計画として登録する。
- Chlens Liveへの新しい通常閲覧機能の追加を止める。
- Overlayで再利用するファイルと、独立アプリ固有ファイルを一覧化する。
- Chrome／Firefox／Tauriの現在のbuild・test結果を記録する。
- Overlay移植中も`apps/chlens-live`を動作比較用に残す。

#### 完了条件

- 独立アプリを完成させない方針が文書化されている。
- 移植元を削除せずに作業を開始できる。
- 既存3 targetの回帰確認方法が決まっている。

### Phase 1：コメントdomainの先行実装

> 進捗：実装済み。コメント入力型、差分抽出、projection、memory event bus、契約テストまで完了。

#### 作業

- `CommentCandidate`、`CommentBatch`、`CommentOverlayState`の型を定義する。
- `IRes[]`とbaselineから新着だけを抽出する純粋関数を実装する。
- HTML本文を表示用プレーンテキストへ変換するprojectionを実装する。
- NG、空本文、重複レスの扱いをテストで固定する。
- runtimeに依存しないmemory event busを用意する。
- `OverlayStage`へ渡すpropsと、Storybookの固定レスfixture形式を先に決める。

#### 完了条件

- ReactとTauriを起動せず、スナップショットから正しい新着batchを生成できる。
- 開始時、再取得時、スレ変更時、停止・再開時の重複条件がテストされている。
- ChLensの既存スレ取得処理は変更されていない。
- Storybookで使うfixtureがdomainの型へ変換でき、ネットワークなしで再利用できる。

### Phase 2：OverlayウィンドウをChLens Tauriへ移植

> 進捗：実装済み。TauriのOverlay entry、native window、platform adapter、geometry保存、クリック透過まで実装した。Windows実機の受け入れ確認はPhase 6で行う。

#### 作業

- ChLens本体のVite buildへOverlay entryを追加する。
- `src-tauri/tauri.conf.json`へ、初期非表示の透明Overlayウィンドウを追加する。
- Overlay用capabilityを必要最小限で追加する。
- クリック透過、表示・非表示、移動、リサイズ、geometry保存をplatform adapterへ移植する。
- カーソル位置commandをChLens本体のRust crateへ移植する。
- Overlay frontendは仮コメントを表示できる状態まで接続する。

#### 完了条件

- ChLens TauriからOverlayを表示・非表示できる。
- 起動直後のOverlayが通常操作を奪わない。
- geometryを再起動後に復元できる。
- Chrome／Firefox buildへTauriウィンドウ処理が混入しない。

### Phase 3：既存ThreadPageとの接続

> 進捗：実装済み。ThreadPageのアクティブな取得結果をcontrollerへ同期し、開始時baselineと新着差分をTauri eventへ送信する。Tauri限定UIの自動テストも追加した。

#### 作業

- ChLens全体で1つの`CommentOverlayController`をProviderまたはserviceとして保持する。
- Tauri版のスレ画面へ開始・停止操作を追加する。
- `useThreadData`の確定済みresponsesをcontrollerへ通知する薄いhookを追加する。
- 実況対象URL、baseline、最終送信レス番号をcontrollerで管理する。
- 新着batchをTauri eventでOverlayへ送信する。
- 通信・Overlay送信エラーを詳細ログへ記録する。

#### 完了条件

- 開始後に到着した新着レスだけがOverlayへ届く。
- 手動更新と自動更新のどちらでも重複表示しない。
- 開始前のレスやキャッシュ再描画を流さない。
- ChLensのスレ表示、NG、検索、auto refreshに回帰がない。

### Phase 4：CommentSchedulerと表示MVP

> 進捗：実装済み。ChLens側のOverlay frontendから既存のscheduler・lane・queueを利用し、Storybookで固定レス、URL指定の過去ログ・現行スレ、Stressを確認できる。混雑時にDOMとレスsnapshotが無制限に蓄積しない上限も追加した。dat落ち時は実況を停止し、一時的な取得エラーではsessionを維持する。設定の永続化まで実装済みで、Windows実機の長時間確認は後続に残す。

#### 作業

- realtime clockと差し替え可能なscheduler境界を実装する。
- 通常コメント用のlane allocatorを実装する。
- 固定`laneCount`を通常動作の前提にせず、`stageHeight / laneHeight`からlane容量を動的に求める。
- allocatorは必要なlaneだけを遅延生成し、`maxLaneCount`をDOMノード増加の安全弁として使う。
- コメント幅、stage幅、速度からdurationを計算する。
- CSS animationでコメントを右から左へ流し、Reactの毎frame再描画を避ける。
- resize時のstage寸法更新と、新規コメントの割り当てを同期する。
- `strict`／`adaptive`／`none`の衝突方針を実装し、ライブ既定値は`adaptive`で待機を作らず即時表示する。
- `strict`／`queue`は過去ログ再生用に残し、`maxActiveCount`でactiveとDOMの上限を設ける。
- 過去ログのfixtureは全件を同時投入せず、playback clockに合わせて一定間隔で投入する。
- active commentの終了時にDOMとlaneを解放する。
- interactive時はhover中のコメントだけをpauseし、付加情報を表示する。
- `Hardcoded`、`PastThreadReplay`、`CurrentThread`、`Stress`のStoryを追加する。

#### 完了条件

- コメントが重なり続けず、複数laneへ割り当てられる。
- ステージ高さに応じてlane容量が増減し、極端に高いステージでも`maxLaneCount`を超えない。
- 短文と長文で極端に滞在時間がずれない。
- 混雑時もメモリとDOMノード数が上限内に収まる。
- resize後も新しいコメントが画面外へ固定されない。
- Storybook上で固定レスと過去スレ再生を再現でき、現行スレStoryは自動次スレへ移動しない。

### Phase 5：Tauri限定UIと設定

> 進捗：実装済み。実況開始・停止、Overlay表示切り替え、スレッド限定表示、Browser版非表示、表示中スレッドを離れた際の自動停止、dat落ち・subject不在時の実況停止、表示設定の保存と実況開始時の反映、開始・送信失敗時の状態復旧とエラー表示、実行中Overlayへの設定変更即時反映まで実装済み。実機操作の確認は後続に残す。

#### 作業

- 既存ステータスバーへ実況開始・停止、状態、Overlay表示切り替えを追加する。
- スレ以外では開始操作を表示しない。
- Browser版では実況関連UIを描画しない。
- 速度、文字サイズ、透明度、最大queue数を既存設定へ追加する。
- Overlay操作バーの製品名をChLensへ変更する。
- エラー、停止、対象スレ変更を利用者へ分かる状態で表示する。

#### 完了条件

- Tauri版ChLensだけで機能の開始から設定まで完結する。
- 設定が再起動後も保持される。
- Chrome／Firefox版の設定画面とステータスバーに不要な項目が出ない。

### Phase 6：安定化と独立アプリの整理判断

> 進捗：自動テストでgeometryの保存・復元、Tauri event adapterの送受信契約、native windowの表示状態に応じたcursor pollingの停止・復帰、実行中設定更新のevent経路、レスsnapshotの上限、Overlay側の閉じる操作とMain側の表示状態同期、操作バーと8方向リサイズのplatform契約、dat落ち時の実況停止条件を固定した。残りはWindows実機でのOverlay操作、表示、負荷、DPI、sleep復帰の受け入れ確認と、独立アプリ整理のレビューである。

#### 作業

- Windowsで複数モニター、DPI変更、sleep復帰、長時間動作を確認する。
- Overlay非表示、閉じる、再表示、メイン最小化時の動作を確認する。
- ネットワーク失敗、dat落ち、スレ移動時の停止条件を確認する。
- rootのcheck、test、Chrome／Firefox／Tauri buildを実行する。
- Chlens Liveとの機能比較を行い、回収漏れがないか確認する。
- 回収完了後に限り、`apps/chlens-live`と専用scriptの削除を別変更として提案する。

#### 完了条件

- 日常利用でコメント流しをChLens Tauriだけから開始できる。
- Chlens Liveを起動しなくても必要なOverlay操作がすべて行える。
- 削除対象と保存する設計記録がレビューされている。
- 独立アプリ削除前のタグまたは到達可能なGit履歴が確認されている。

## MVPの定義

次を満たした時点を最初のMVPとする。

- Windows版ChLensのスレ画面からコメント流しを開始・停止できる。
- 開始後の新着レスだけが透明Overlayを右から左へ流れる。
- コメントは複数laneへ割り当てられ、混雑時に無制限に蓄積しない。
- Overlayを表示・非表示、移動、リサイズでき、geometryが保存される。
- NGレスと空本文を初期値で流さない。
- Browser版のUIと挙動が変わらない。
- 既存ChLensのスレ取得以外に、同じスレへの定期取得を追加していない。

次はMVP後に判断する。

- 表示中タブと独立したバックグラウンド実況
- 過去ログ再生
- 上固定・下固定コメント
- 自動次スレと実況対象の自動切り替え
- コメントクリックやレスへのジャンプ
- 複数スレの同時実況

## 検証計画

### 自動テスト

- 新着差分、baseline、重複排除、スレ変更
- HTMLから表示用テキストへのprojection
- NG、空本文、長文、絵文字、改行
- lane allocatorの衝突判定
- schedulerのqueue上限、skip、終了処理
- memory event busとTauri event adapterの契約
- Overlay geometryの保存・復元
- Tauri限定UIのruntime分岐
- 既存ThreadPageとuseThreadDataの回帰

### build gate

各フェーズで、変更範囲に応じて次を実行する。

```bash
pnpm lint
pnpm tsc6
pnpm test
pnpm run build:chrome
pnpm run build:firefox
pnpm run build:tauri
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
```

### Windows手動確認

- Overlayが常に最前面で透明表示される。
- クリック透過中に背後のアプリを操作できる。
- 操作バーとリサイズ領域だけを操作できる。
- 最大化、復元、最小化、閉じる、再表示が行える。
- 複数モニターと異なるDPI間でgeometryが破綻しない。
- メインウィンドウ最小化中も、既存の取得が動く範囲でコメントが流れる。
- 長時間動作してもコメントDOMとqueueが増え続けない。

## 主なリスクと対策

### ThreadPageへの結合が増える

`ThreadPage`へOverlay実装を直接書かず、確定済みresponsesをcontrollerへ渡すhookだけを置く。
差分抽出、event、schedulerはfeature配下へ分離する。

### 同じスレを二重取得する

MVPでは既存`useThreadData`の結果だけを使う。バックグラウンド実況を追加する場合は、先に取得sessionの
共有方法を設計し、Live sessionをそのまま並行起動しない。

### Tauri依存がBrowser版へ漏れる

runtime分岐だけに頼らず、platform portとadapterを分ける。Chrome／Firefox buildを各フェーズの
必須gateにする。

### Live側と移植先を同時修正して差分が分からなくなる

移植期間中は`apps/chlens-live`を参照専用として凍結する。修正はChLens側へ行い、比較完了後に
独立アプリを整理する。

### Overlayの混雑でUIが重くなる

queue、active comments、DOMノード数に上限を持たせる。古いコメントをskipしてライブ感を優先し、
全レスの確認はChLens本体のスレ表示へ委ねる。

## 推奨Issue分割

1. 方針変更と移植対象を文書化する
2. コメント差分・projection domainを追加する
3. ChLens TauriへOverlay entryとwindowを追加する
4. Overlay platformとgeometry保存を移植する
5. ThreadPageの新着をOverlay eventへ接続する
6. CommentSchedulerと通常laneを実装する
7. Tauri限定のステータスバー操作を追加する
8. コメント表示設定を既存設定へ追加する
9. Windows長時間・複数モニター確認を行う
10. Chlens Live独立アプリの整理可否を判断する

## 推奨コミット単位

1. `docs(architecture): コメントオーバーレイのTauri統合計画を追加`
2. `feat(thread): コメント新着差分のdomain契約を追加`
3. `refactor(platform): LiveのOverlay境界をChLensへ移植`
4. `feat(platform): ChLens TauriへOverlayウィンドウを追加`
5. `feat(thread): スレ新着をコメントイベントへ接続`
6. `feat(platform): コメントのlane割り当てと描画を追加`
7. `feat(browser): Tauri限定の実況操作を追加`
8. `feat(settings): コメント表示設定を追加`
9. `chore(architecture): 独立Chlens Liveアプリを整理`

リファクタリング、Tauri境界、コメントの挙動変更、独立アプリ削除を同じコミットへ入れない。

## 削除判断

`apps/chlens-live`は現時点では削除しない。次をすべて満たした後、独立した変更として削除を判断する。

- Overlayウィンドウ制御がChLens Tauriへ移植済みである。
- 新着コメントの表示MVPがChLens Tauriで動作する。
- geometry、クリック透過、Tauri eventの回収漏れがない。
- 旧ロードマップとPhase spike文書を残すことが確認されている。
- Live専用build scriptとworkspace依存の削除範囲が確認されている。
- 人がWindows実機でChLens Tauri版に満足している。

削除後も、旧ロードマップとPhase spike文書は設計判断と検証履歴として保持する。

## 最初に着手する範囲

最初の実装PRは、Phase 1とPhase 2の一部に限定する。

1. コメント差分・projectionの純粋domainを追加する。
2. ChLens Tauriで初期非表示のOverlayを起動できるようにする。
3. 仮コメントをeventで送り、Overlayに表示する。
4. Chrome／Firefox／Tauriのbuildを確認する。

この段階ではThreadPageの自動更新、ステータスバー、設定、CommentSchedulerへ手を広げない。
OverlayをChLens本体へ安全に載せられることを確認してから、新着レス接続と流れる表示へ進む。
