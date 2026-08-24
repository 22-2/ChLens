# Chlens Live 開発ロードマップ

## 目的

EdgeLiveViewer の基本機能を継承しつつ、Chlens の取得・解析・検索・絞り込み・NG DSL・
履歴・UI 資産を再利用して、エッヂ実況向けの独立した Tauri クライアント
「Chlens Live」を新規構築する。

Chlens Live は単なる透明オーバーレイではなく、次を一体化した実況用クライアントとする。

- エッヂのスレ一覧とスレビュー
- 1 回のレス取得結果を利用するメイン画面と透明オーバーレイ
- スレ内検索、人気・画像・動画・リンク絞り込み
- スレッド／レス向け NG・ハイライト DSL
- 書き込み、自分のレスと返信の強調、自動次スレ
- 閲覧履歴、書き込み履歴、取得済みログ検索
- ブラウザ拡張機能版／Tauri 版 Chlens との相互起動

本ロードマップは機能移植だけでなく、Chlens と Chlens Live が同じ資産を安全に利用するための
段階的なリファクタリングを含む。

## プロダクト境界

### Chlens Live が担当するもの

- エッヂ実況を開始・停止する Live Session
- Live Session が取得したレスのメイン画面表示
- 透明・常に手前のコメントオーバーレイ
- エッヂのスレ一覧、スレ検索、スレビュー、書き込み
- Chlens Live 専用の設定、DSL ルール、履歴、キャッシュ
- Chlens を開く、または Chlens から開かれるための連携窓口

### Chlens が引き続き担当するもの

- 汎用的な 5ch 互換掲示板クライアント
- ブラウザ拡張機能としてのページ置換・タブ連携
- 板一覧、お気に入り、2 ペイン、通常閲覧向けの機能
- Chlens 独自の設定、DSL ルール、履歴、キャッシュ

### 初期スコープ外

- エッヂ以外の実況掲示板対応
- Chlens と Chlens Live の設定・DB の直接共有
- ブラウザ拡張機能と Live の常時 IPC／Native Messaging
- Chlens Live のお気に入り、板一覧、2 ペイン
- EdgeLiveViewer の Python コードを段階的に書き換えて再利用すること

## 設計原則

1. **Live 内では取得を一元化する。** 1 つの `LiveThreadSession` がレスを取得し、
   メイン画面と Overlay が同じスナップショットを利用する。
2. **閲覧中タブと実況対象を分離する。** 別タブを確認しても実況対象を暗黙に切り替えない。
3. **Rust は OS 境界に限定する。** ウィンドウ、Deep Link、Single Instance、HTTP plugin、
   永続化 plugin 以外の取得・解析・状態管理は TypeScript 側に置く。
4. **共通化は実際の第 2 利用者ができる直前に行う。** Live 開発前の全面的な package 分割は行わない。
5. **リファクタリングと挙動変更を分ける。** 既存 Chlens の挙動を固定してから移動し、
   Live 固有の簡略化は adapter／composition 側で行う。
6. **永続データは製品ごとに分ける。** コードと DSL 構文は共有しても、設定値・ルール・履歴は共有しない。
7. **Chlens 本体の Chrome／Firefox／Tauri ビルドを各段階のゲートにする。**

## Overlay の速度・レーン方針

Chlens Live の速度感は EdgeLiveViewer より速めにする。速度設定は「1コメントの表示秒数」
ではなく、Danmaku と同じく「ステージ上を進む基準 px/sec」として扱う。

Danmaku の速度モデルを採用する。

```text
duration = stageWidth / baseSpeed
actualPxPerSecond = (stageWidth + commentWidth) / duration
```

このモデルでは、短文と長文がステージ上に滞在する時間を揃えられる。初期値は Danmaku の
`144px/sec` を基準にし、実際の Overlay サイズと見た目を確認して調整する。600px 幅なら
ステージ幅の通過時間は約 4.2 秒となり、EdgeLiveViewer の現在の既定値 `comment_speed=6.0`
より速い。設定値の意味を変更するため、EdgeLiveViewer の設定値を自動移行しない。

- [Danmaku README の speed 仕様](https://github.com/weizhenye/Danmaku#speed)
- [Danmaku の DOM／Canvas renderer と live mode](https://github.com/weizhenye/Danmaku#live-mode)
- [EdgeLiveViewer の現在の既定速度](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:132)
- [EdgeLiveViewer の移動距離と速度計算](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:1253)

レーン管理は CommentCoreLibrary の allocator 構造を参考にする。ただし初期実装では通常スクロールを
中心にし、上固定・下固定を追加可能な境界だけ先に用意する。

- [CommentCoreLibrary の mode 別 allocator](https://raw.githubusercontent.com/jabbany/CommentCoreLibrary/master/src/CommentManager.js)
- [EdgeLiveViewer の現在のレーン判定](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:952)
- [EdgeLiveViewer の現在の追いつき処理](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:453)

混雑時に既存コメントの速度を急に変えない。`CommentScheduler` は次の責務を持つ。

```text
CommentScheduler
  ├─ pending comments
  ├─ active comments
  ├─ scroll lane allocators
  ├─ realtime / playback clock
  └─ backlog policy
```

queue が詰まった場合は、速度を不規則に上げるのではなく、投入数の上限、古いコメントのスキップ、
遅延表示を組み合わせる。Overlay はライブ感を優先し、全レスの確認は Main のスレビューで保証する。
過去ログ再生に備え、clock は `realtime` と `playback` を差し替えられるようにする。

## 目標構成

最終的には次の workspace 構成を目標とする。ただし、package は利用箇所が 2 つになった段階で作る。

```text
read.crx-2/
├─ apps/
│  └─ chlens-live/
│     ├─ src/
│     │  ├─ app/                    # Main shell、routing、composition
│     │  ├─ live-session/           # 取得・差分・再生・次スレ状態
│     │  ├─ overlay/                # Overlay用projectionとUI
│     │  └─ platform/               # Tauri adapter
│     └─ src-tauri/                 # Live専用bundle／window／plugin設定
├─ packages/
│  ├─ ch-lib/                       # 既存URL・fetcher・parser
│  ├─ chlens-core/                  # 共有domain serviceとstorage port
│  ├─ chlens-thread-ui/             # ThreadList／Threadの共有表示部品
│  └─ chlens-bridge/                # 相互起動URLとpayload契約
├─ src/                             # 既存Chlensアプリ
└─ src-tauri/                       # 既存Chlens Tauriアプリ
```

### package 分割の基準

| package            | 入れるもの                                             | 入れないもの                                    |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------- |
| `ch-lib`           | URL、掲示板形式、dat／subject parser、取得プリミティブ | React、Tauri、browser extension API             |
| `chlens-core`      | スレ状態、絞り込み、DSL評価、履歴の型とport            | DOM、React hook、具体的なSQLite／IndexedDB      |
| `chlens-thread-ui` | props駆動のThreadList／Thread表示、popup UI            | fetch、global container、タブdispatch、製品設定 |
| `chlens-bridge`    | version付きopen/start payload、URL encode/decode       | OSへの登録処理、実際のnavigation                |

package を増やすこと自体を目的にせず、既存モジュールを薄い facade の後ろへ移動してから、
必要な単位だけ workspace package に昇格する。

## 共有データフロー

```text
Eddibb endpoints
      │
      ▼
LiveThreadSession ──────── Live専用cache／history
      │
      ├─ Thread snapshot ── Main ThreadView
      ├─ New responses ──── Overlay window
      ├─ Write result ───── Own-response tracking
      └─ Open target ────── Chlens bridge
```

- `LiveThreadSession` は同時に 1 スレだけ active にする。
- Main で別スレを閲覧しても active session は維持する。
- Overlay は取得を行わず、Main 側 session から新着 batch と設定projectionを受け取る。
- Main window を閉じる操作は、実況中なら終了確認または tray 常駐へ変換する。
- Chlens へ渡す基本データは `threadUrl`、`resNum`、`action`、`version` に限定する。

## 現在の主な結合点と分離方針

| 現在の領域                      | 主な結合                                        | 分離方針                                          |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `ThreadPage.tsx`                | fetch、tab、history、popup、write、auto refresh | controller hook と props 駆動 view に分割         |
| `ThreadListPage.tsx`            | service container、tab dispatch、table state    | query/controller と table view に分割             |
| `use-thread-data.ts`            | React lifecycle と ThreadService                | framework非依存sessionを先に抽出                  |
| `use-popup-manager` 周辺        | DOM、scope、Thread固有state                     | 既存facadeを保ち、共有UIから注入できるAPIへ寄せる |
| `NG.ts`／rules                  | config singleton、container                     | parser/evaluator と rule repository を分離        |
| `History.ts`／`WriteHistory.ts` | runtime判定、具体DB                             | repository port と製品別adapterを分離             |
| `NavigationBar`／tab store      | Chlens全機能前提                                | Live専用shellから共有viewをcompositionする        |
| `src-tauri`                     | Chlens単一bundle前提                            | Liveは独立したidentifierとTauri crateを持つ       |

## 実施ロードマップ

### Phase 0: 要件と既存挙動の固定

#### 目的

共通化で壊してはいけない Chlens の契約と、Chlens Live の初期スコープをテスト可能な形で固定する。

Phase 0で固定した仕様・既存挙動の根拠は、[Phase 0 仕様・既存挙動固定](./chlens-live-phase0-spec.md)にまとめる。

#### 作業

- 本文書を基準に MVP／後続機能を Issue へ分割する。
- ThreadList、Thread、filter、popup、NG DSL、history、write history の既存テスト範囲を整理する。
- 次の契約テストが不足していれば追加する。
  - スレ内検索と5種のfilter切り替え
  - URL正規化後も同一スレとして扱うこと
  - NG／highlight DSLのboard／thread／response評価
  - 指定レスジャンプとfilter解除後ジャンプ
  - auto refresh中の差分反映とread state
  - write historyから対象レスを開くこと
- EdgeLiveViewer の機能を「継承」「再設計」「廃止」に分類する対応表を作る。
- Liveの対象URLをエッヂに限定し、URL／thread ID入力の正規化仕様を決める。

#### 完了条件

- Chlens Live MVP の必須機能とスコープ外が合意されている。
- 共通化対象の既存挙動がテストまたは明文化された手動確認項目で固定されている。
- リファクタリングIssueとLive機能Issueが混在していない。

### Phase 1: workspace と境界の準備

Phase 1の実装記録と検証結果は、[Phase 1 workspace／window spike](./chlens-live-phase1-spike.md)にまとめる。

#### 目的

既存 Chlens と独立して build／run できる Live の最小アプリを置き、共有コードの移動先を確保する。

#### 作業

- `pnpm-workspace.yaml` に `apps/*` を追加する。
- `apps/chlens-live` に React／Vite+ の最小entryを作る。
- Live専用 `src-tauri`、product name、identifier、capabilitiesを作る。
- Main と Overlay の2ウィンドウを定義する。
- MainからOverlayの表示／非表示、focus、位置保存を操作できるspikeを作る。
- Live用のplatform interfaceを定義し、Tauri APIをUIから直接散在させない。
- root buildとLive buildを独立したscriptにする。

#### 完了条件

- Chlensの既存3 targetとChlens Liveを別々にbuildできる。
- 透明Overlayを表示し、Mainから制御できる。
- Liveを追加しても既存Chlens bundleの出力が変わらない。

#### 現在の状況

Phase 1のworkspace／window spikeは実装済みで、Windows上でOverlayの起動・ドラッグ・リサイズ・
最大化／復元・最小化・閉じる・クリック透過を確認している。現在の構成は次のとおり。

- MainとOverlayをLive専用のTauriアプリ内で分離し、Overlayは同一native window内に表示面と操作バーを持つ。
- バー中央はWebView2の`app-region: drag`、ボタンとリサイズ領域は`no-drag`で分離する。
- バーのダブルクリックによる最大化／復元はOSへ委譲し、最大化ボタンは単一クリック操作とする。
- クリック透過は起動時から有効にし、画面座標監視でバーとリサイズ境界だけ一時的に操作可能にする。
- バーの表示状態と連続ラインのリサイズ枠を同期し、透明documentのoverflowとgeometryずれを抑制する。
- Overlayのgeometryはlogical pixelとして保存・復元し、Mainから表示／非表示／focus／geometry操作を行う。

#### Phase 1の既知の残課題

- バー全体へポインターを移動したとき、最小化／最大化ボタンのhover演出が出ることがある。`app-region`のnative領域とWebView2のclient領域のhover境界を、ボタン直上だけへ限定するUI調整を後続タスクとして残す。
- クリック透過、複数monitor、DPI変更、sleep復帰を含む長時間のWindows手動確認は、Phase 7のOverlay MVP受け入れ時に再確認する。

### Phase 2: 掲示板domain／取得資産の共通化

Phase 2の最初の境界検証は、[Phase 2 domain／取得 spike](./chlens-live-phase2-spike.md)にまとめる。
既存の`packages/ch-lib`をLiveから利用し、URL正規化・transport・decode・parserの契約を固定してから本実装へ進む。

#### 目的

ChlensとLiveが同じURL・subject・dat・responseモデルを利用できるようにする。

#### Phase 2の現状チェックリスト（domain／取得 spike完了時点）

##### 完了

- [x] `packages/ch-lib`のworkspace package名を`@chlen/ch-lib`へ統一する。
- [x] `ChURL`による5ch互換、Eddibb、まちBBS、したらばのURL正規化とsubject／dat URL生成をLiveから再利用する。
- [x] `HttpClient`／`HttpResponse`／`FetchHttpClient`のtransport契約を追加する。
- [x] `ChFetcher`へtransport injectionとHTTP status errorを追加する。
- [x] subject／datの文字コードdecodeと既存parserを、UI非依存の取得経路で接続する。
- [x] Eddibbのboard URL、Shift_JIS subject、thread dat URL、HTTP 404をfixtureで検証する。
- [x] Live側に`loadBoard`／`loadThread`のsource composition boundaryと契約テストを追加する。
- [x] LiveのVite／Vitest／TypeScript設定からworkspace sourceを解決する。

##### 未着手（Phase 2本実装）

- [x] Tauri HTTP pluginを`HttpClient`へ接続するadapterを実装する。
- [x] ETag、Last-Modified、dat size、res lengthをresponse metadataとして型にする。
- [x] `LiveThreadSession`のpolling、条件付き差分取得、エラー後の再試行、停止条件を実装する。
- [x] thread dat snapshotとsubject snapshotのcache policyをmemory／localStorage adapterとして実装する。
- [x] dat落ちHTTP status（404／410）をsession error contractへ伝播する。
- [x] 過去ログの取得・再生契約を実装する。`ChURL`のarchive判定、したらばarchive HTML parser、指定レス範囲を投影する`LiveThreadPlaybackSession`、live／playback排他ownerを追加した。
- [x] `@chlen/ch-lib`にcanonicalな`IThread`／`IRes`型名を公開し、既存`ThreadData`／`Post`と後方互換にする。
- [x] Chlens legacy `ParsedThread`／`ThreadRes`をcanonical modelへ移行する。旧cache形を壊さず、Thread service入口で`@chlen/ch-lib`の`IThread`／`IRes`へ変換するadapterを追加した。
- [x] MainとOverlayへ取得結果を共有するserializable event contractとsession ownerを決める。
- [x] Chlens既存のBoard／Thread serviceを共通API経由へ移行し、回帰を確認する。subject parserのcanonical型とThread serviceのcanonical adapterを接続し、既存UI投影を維持した。
- [ ] Tauri実機でboard／thread取得、複数形式、ネットワーク失敗を手動確認する。release buildとMSI／NSIS生成は完了、実操作だけ要確認。

##### 既知の確認課題

- [x] `@chlen/ch-lib`全体テストをgreenにする。`BBSMenuParser`のカテゴリ終端判定を修正し、22/22件が成功している。
- [x] ch-lib fixture／parser test 22件とLive test 25件、Live check／build、Rust `cargo check`は成功している。
- [x] 既存Chlens全体テスト504件、Tauri release build、MSI／NSIS bundle生成が成功している。

#### 作業

- `packages/ch-lib` の公開APIと依存方向を固定する。
- エッヂURLのcanonical化、board URL、thread URL、dat URL生成を共通APIにする。
- subject取得・parse、thread取得・parseをUI非依存APIへ寄せる。
- `IThread`、`IRes`、thread detailの重複型を整理する。
- incremental fetchに必要なetag、last-modified、dat size、res lengthを明示的な型にする。
- browser `fetch` と Tauri HTTP plugin の違いを `HttpClient` adapterで吸収する。
- Shift_JIS decode、HTTP error、dat落ち、過去ログの契約テストを追加する。

#### 完了条件

- Reactを起動せず、エッヂのスレ一覧とスレ詳細を取得・解析できる。
- Chlensの既存Thread／Board serviceが共通APIを経由しても回帰しない。
- Live側に掲示板形式固有の正規表現やdat parserを複製していない。

### Phase 3: NG／ハイライト DSL の共通化

実装記録と検証結果は[Phase 3実装記録](./chlens-live-phase3-spike.md)にまとめた。

#### 目的

DSL構文と評価器を共有し、ルールの保存先だけを製品ごとに分ける。

#### 作業

- DSL parser、catalog、validator、evaluatorからconfig singleton依存を外す。
- board／thread list向け評価とresponse向け評価を明示的なAPIに分ける。
- `RuleRepository` interfaceを追加する。
- Chlens adapterは既存config keyをそのまま利用する。
- Live adapterはLive専用storage key／DBを利用する。
- Monaco DSL editorのlanguage definitionと補完候補を共有可能にする。
- 既存ルールの結果と共通evaluatorの結果が一致するcharacterization testを追加する。

#### 完了条件

- 同じDSL sourceに対しChlensとLiveで同じ評価結果になる。
- 片方のルール編集がもう片方の保存内容を変更しない。
- parser／evaluatorがReact、Tauri、browser storageをimportしない。

### Phase 4: ThreadList 表示資産の分離

実装記録と検証結果は[Phase 4実装記録](./chlens-live-phase4-spike.md)にまとめた。

#### 目的

Chlensのスレ一覧表示・検索・sort・NG・highlightをLiveから再利用できるようにする。

#### 作業

- `ThreadListPage` を次へ分割する。
  - query／refreshを担当するcontroller
  - search／sort／filter state
  - props駆動の`ThreadListView`
- row click、double click、context menuをcallbackで注入する。
- bookmark、board navigation、2 paneなどChlens固有操作をoptional actionにする。
- Live側でエッヂ固定boardのThreadList controllerを実装する。
- 勢い順、新着順、タイトル検索、自動更新を実装する。
- スレッドNG／highlight DSLを適用する。

#### 完了条件

- 同じ`ThreadListView`をChlensとLiveの両方でrenderできる。
- Liveでは不要なボタンをCSSで隠さず、action未提供として構成できる。
- Chlensのスレ一覧操作と既存テストが回帰していない。

### Phase 5: Thread 表示資産の分離

#### 目的

Chlensのスレビューを、取得元とタブ実装に依存しない共有viewへ分割する。

#### 作業

- `ThreadPage` から次のcontroller責務を外す。
  - fetch／refresh
  - read state保存
  - tab dispatch／navigation
  - auto next thread
  - write panel連携
  - history追加
- props駆動の`ThreadView`を作る。
- `ThreadView`内で次を共有する。
  - 全文検索
  - すべて／人気／画像／動画／リンクfilter
  - response list／virtualization
  - anchor preview／返信tree／ID popup
  - response context menuの共通項目
  - NG表示と一時解除
  - 自分のレス／返信の強調表示
  - 指定レスジャンプ
- Chlens固有actionとLive固有actionをcontext objectで注入する。
- 既存`ThreadPage`はChlens controllerと共有`ThreadView`を組み合わせるfacadeにする。

#### 完了条件

- Liveのfixtureデータだけで共有`ThreadView`を表示できる。
- 共有viewがglobal `window.app`、browser tabs、Tauri APIを直接参照しない。
- Chlens側のfilter、popup、context menu、jump挙動が維持されている。

### Phase 6: Live Session と Main MVP

#### 目的

エッヂのスレを選び、1回の取得でMainへリアルタイム表示できる日常利用可能なread-only MVPを作る。

#### 作業

- `LiveThreadSession` の状態機械を実装する。
  - idle／connecting／live／paused／expired／error
  - current thread identity
  - snapshotとnew response batch
  - retry／backoff／manual refresh
- スレ一覧から「このスレで実況開始」を実装する。
- URL／thread ID直接入力を実装する。
- 閲覧中タブとactive Live Sessionを分離する。
- 実況中タブ表示、実況中スレへ戻る、明示的な実況切替を実装する。
- 常時表示URLバーとLive操作toolbarを実装する。
- 通常タブ種別をthread list／threadの2つに限定する。
- settings／history系を後で追加できるtool view outletを用意する。

#### 完了条件

- スレ一覧から実況を開始し、新着レスがMainのThreadViewへ追加される。
- 別タブを閲覧してもLive Sessionが継続する。
- 同一スレをMainとSessionが別々にpollしない。
- 接続失敗がUIとlogへ詳細に表示され、握りつぶされない。

### Phase 7: Overlay MVP

#### 目的

Live Sessionの新着レスを、別取得なしで透明Overlayへ流す。

#### 作業

- MainからOverlayへresponse batchを送るversion付きevent contractを作る。
- `CommentScheduler`をTypeScriptで実装する。既存ライブラリをそのまま組み込まず、
  Danmakuの速度モデルとCommentCoreLibraryのallocator／runlineの考え方だけを取り入れる。
- 速度設定は`baseSpeedPxPerSecond`とし、初期値は`144`を基準にする。
- `duration = stageWidth / baseSpeed`、実際の移動速度は`(stageWidth + commentWidth) / duration`とする。
- レーンごとにactive commentの占有状態を管理し、コメントが画面外へ出た時点でレーンを解放する。
- 初期対応モードは通常スクロールとし、上固定／下固定は同じallocator契約へ追加できるようにする。
- `realtime`／`playback`を切り替えられる`CommentClock`を用意する。
- DOM rendererを基本とし、レス番号を`data-res-num`で保持してMainへのジャンプやChlens連携に利用する。
- queueが詰まった場合のbacklog policyを実装する。既存コメントの速度をその場で変更しない。
- 次を設定可能にする。
  - font、size、weight、color、shadow
  - base speed、spacing、position、max comments
  - opacity、always on top、click through
  - window geometry、16:9 lock、maximize
- 操作モードとクリック透過モードを明示的に切り替える。
- own response／reply-to-ownの強調を実装する。
- NG済みレスをOverlayへ送らないprojectionを作る。
- 画像・GIFは後から差し替えられるmedia renderer境界を置く。
- OBS確認用のopaque／chroma-key modeを実装する。

#### 完了条件

- MainとOverlayの表示レス番号が同じsession snapshotに由来する。
- Overlayを閉じて再表示してもLive Sessionは切断されない。
- 1000レス相当のfixtureでlane衝突、queue肥大、memory leakがない。
- 初期速度設定がEdgeLiveViewerより速く、短文・長文の滞在時間が極端に崩れない。
- queue増加時も既存コメントが突然加速せず、backlog policyの結果がMainで確認できる。
- Windowsの透明、常に手前、クリック透過、OBS captureを手動確認している。

### Phase 8: 書き込み・自動次スレ・過去ログ

#### 目的

EdgeLiveViewerの主要な実況操作を継承し、Live単体で実況を完結できるようにする。

#### 作業

- Mainにwrite panelを追加する。
- 投稿成功後のpending own response照合を共有ロジックへ寄せる。
- 自分のレスと自分への返信をMain／Overlayで同じ基準で強調する。
- 自動次スレ候補検索と明示的／自動切替を実装する。
- 次スレ切替時も旧スレの表示中コメントを自然に流し切る。
- 過去ログを指定レスから再生するplayback sessionを追加する。
- playback speed、comment delay、一時停止、再開を実装する。
- 画像、GIF、URL表示／非表示設定を移植する。

#### 完了条件

- Liveから投稿し、確定したレス番号がMain／Overlay双方で強調される。
- 次スレ切替でresponse identityやown responseが別スレと混ざらない。
- 過去ログを指定レスから再生し、live pollingと同時に走らない。

### Phase 9: 履歴・書き込み履歴・ログ検索

#### 目的

Liveで取得・閲覧・投稿した内容を、Live専用データとして後から検索・再表示できるようにする。

#### 作業

- ChlensのHistory／WriteHistoryからrepository interfaceを抽出する。
- Live専用SQLite schemaとmigrationを追加する。
- tool viewとして次を追加する。
  - 閲覧履歴
  - 書き込み履歴
  - 取得済みログ検索
  - 設定
- 履歴／検索結果からthread tabを開く。
- 書き込み履歴から該当レスへジャンプする。
- ログから過去ログplaybackを開始できるようにする。
- 削除、保持期間、全消去の境界を製品ごとに分ける。

#### 完了条件

- ChlensとLiveのDBを同時に利用しても互いの内容を変更しない。
- Liveで閲覧したスレだけがLive履歴・ログ検索へ現れる。
- history／write historyの既存ChlensテストとLive adapterテストが通る。

### Phase 10: Chlens相互起動

#### 目的

LiveとChlensを、共有DBなしでthread／response単位に往復できるようにする。

#### 作業

- version付きbridge payloadを定義する。

```ts
interface ChlensOpenTargetV1 {
  version: 1;
  action: "open" | "start-live";
  threadUrl: string;
  resNum?: number;
  source: "chlens" | "chlens-live";
}
```

- Liveからブラウザ版Chlens向けに通常のthread／response URLを開く。
- LiveからTauri版Chlens向けのcustom schemeを追加する。
- ChlensからLive向けに次を追加する。
  - このスレをLiveで開く
  - このスレで実況開始
  - このレスをLiveで開く
- LiveへDeep Link／Single Instanceを追加する。
- 未起動、起動中、起動直後、invalid payloadをテストする。
- 外部入力URLをstrictに検証し、エッヂ以外は実況開始しない。

#### 完了条件

- ブラウザ版Chlensを主利用する環境でLiveから対象レスを開ける。
- Chlensから起動済みLiveの正しいtab／resへ移動できる。
- custom URLを複数回開いてもLiveが多重起動しない。

### Phase 11: 日常利用への移行とEdgeLiveViewer退役判断

#### 目的

Chlens Liveを日常の実況で使い、EdgeLiveViewerから移行できる品質を確認する。

#### 作業

- 長時間実況でCPU、memory、network、queue長を計測する。
- DPI、複数monitor、maximize、sleep復帰、network切断を確認する。
- auto update／next thread／playbackの競合を確認する。
- settings、window geometry、session recoveryを確認する。
- 単一EXE／installer／update方針を決める。
- EdgeLiveViewerとの差分表を更新し、未移植機能を採用／廃止判断する。
- 十分な実利用確認後にのみEdgeLiveViewerをmaintenance modeとする。

#### 完了条件

- 通常の実況をChlens Liveだけで完了できる。
- 未移植機能が既知の制限として文書化されている。
- EdgeLiveViewerを残す必要がある用途と退役条件が明確になっている。

## マイルストーン

| milestone                 | 到達状態                                             | 対応phase |
| ------------------------- | ---------------------------------------------------- | --------- |
| M0: Architecture Ready    | Live最小appと共有境界がbuildできる                   | 0〜2      |
| M1: Shared Reading        | 共通ThreadList／ThreadViewをChlensとLiveで利用できる | 3〜5      |
| M2: Read-only Live        | Mainで実況スレを1回取得しリアルタイム閲覧できる      | 6         |
| M3: Overlay Daily Driver  | 透明Overlayを実実況で利用できる                      | 7         |
| M4: EdgeLiveViewer Parity | 書き込み、次スレ、過去ログ、画像表示を利用できる     | 8         |
| M5: Chlens Companion      | 履歴・ログ・双方向連携まで揃う                       | 9〜10     |
| M6: Migration Ready       | 長時間運用と配布を確認し退役判断できる               | 11        |

## MVP の定義

最初の日常利用版は M3 とし、次を必須とする。

- エッヂのスレ一覧、勢い順／新着順、スレタイ検索
- URL／thread IDから開く
- thread tab、スレ内検索、人気・画像・動画・リンクfilter
- スレッド／レスNG・highlight DSL
- active Live Sessionと閲覧tabの分離
- 1回の取得でMainとOverlayを更新
- 透明、常に手前、クリック透過、font／speed／opacity設定
- エラー表示、再接続、window geometry保存

MVPには次を含めない。

- 閲覧履歴、書き込み履歴、ログ検索
- 過去ログplayback
- ChlensからLiveを開く
- お気に入り、2ペイン、板一覧

ただし、history repository、bridge target、playback sourceを後付けできるinterfaceはMVP時点で確保する。

## 検証戦略

### 各共有化phase

```bash
vp check
vp test
pnpm run build:chrome
pnpm run build:firefox
pnpm run build:tauri
```

### Live追加後

```bash
pnpm --filter chlens-live check
pnpm --filter chlens-live test
pnpm --filter chlens-live build
pnpm --filter chlens-live tauri build
```

実際のscript名はPhase 1で確定し、rootから全targetを検証できるaggregate taskを追加する。

### 必須fixture

- 通常のlive thread
- 短時間に大量レスが来るthread
- 1000到達と次スレ候補あり／なし
- dat落ち／過去ログ
- NG、highlight、自分のレス、自分への返信
- 画像、GIF、動画、通常リンク
- broken dat line、文字化け、HTTP 206／304／416、rate limit

### 手動確認

- Mainで別タブを見ながらOverlayが元のLive Sessionを流し続ける。
- Overlayを操作モードとクリック透過モードで切り替える。
- OBSのwindow captureで透明／クロマキー表示を確認する。
- ChlensとLiveを同時起動し、双方の設定・履歴が混ざらない。
- Liveとブラウザ版Chlensの間で同じthread／responseを往復する。

## 主なリスクと対策

| リスク                                          | 対策                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| 共通化が先行しLiveの価値検証が遅れる            | 各抽出phase直後にLive側consumerを追加する                             |
| `ThreadPage`分割でChlensのpopupやscrollが壊れる | characterization testを先に追加しfacadeを維持する                     |
| packageが細分化され依存関係が複雑になる         | 第2consumerができるまで既存module内に置く                             |
| MainとOverlayが別々にfetchする                  | fetchを`LiveThreadSession`だけに許可しOverlay contractにURLを渡さない |
| hidden Mainでtimerがthrottleされる              | Mainを破棄せず、必要ならbackground throttlingを実測して対策する       |
| browser fetchがCORSで失敗する                   | TypeScript側の`HttpClient`からTauri HTTP plugin adapterを利用する     |
| ChlensとLiveのルールが意図せず同期する          | repositoryを分け、import／exportだけを明示操作にする                  |
| Deep Linkから不正URLを渡される                  | payload version、scheme、host、board、resNumをstrictに検証する        |
| EdgeLiveViewer完全再現でscopeが膨らむ           | M3を先に日常利用し、不足した機能だけPhase 8以降へ入れる               |

## 推奨Issue分割

1つのIssueでリファクタリングとLive機能を同時に扱わず、次の単位を基本とする。

```text
[architecture] Chlens Liveのworkspace骨格を追加
[core] エッヂURLとスレ取得契約を分離
[ng] DSL評価とルール永続化を分離
[thread-list] 再利用可能なThreadListViewを抽出
[thread] 再利用可能なThreadView契約を抽出
[live] LiveThreadSessionを単一所有者として追加
[live] 読み取り専用のLive Main画面を追加
[overlay] 透明オーバーレイへのレス表示を追加
[overlay] コメントのレーン制御と設定を追加
[write] Liveの書き込みと自分のレス追跡を追加
[history] Live用の履歴repositoryと画面を追加
[bridge] ChlensとLiveのバージョン付き起動先を追加
```

各Issueは1つの既存挙動境界または1つのLive縦切りに限定し、完了時に自動テスト、build、
必要な手動確認を記録する。

Issueのタイトル・本文・コメントは日本語で記述する。ただし、上記の`[<module_name>]`のような
分類用プレフィックスや、既存の固定識別子は機械的な運用上の文字列として維持する。

## 推奨コミット単位

```text
docs(live): Chlens Liveの要件とロードマップを追加
test(thread): 共有化前のスレビュー契約を固定
refactor(core): エッヂ取得処理をplatform非依存に分離
refactor(ng): DSL評価とルール永続化を分離
refactor(thread-list): ThreadListViewをcontrollerから分離
refactor(thread): ThreadViewを取得とnavigationから分離
feat(live): Chlens Live workspaceとMain shellを追加
feat(live): LiveThreadSessionで実況取得を一元化
feat(overlay): 透明オーバーレイへ新着レスを表示
feat(bridge): ChlensとLiveの相互起動を追加
```

Conventional Commitsのtype/scopeは形式上の識別子として英語のままにし、件名と本文は日本語で統一する。

## 全体完了条件

- ChlensとChlens Liveが独立した成果物としてbuild・配布できる。
- Live内で同じthreadをMainとOverlayが重複取得しない。
- ThreadList／ThreadView／DSL parser・evaluatorが両製品から共有されている。
- Chrome／Firefox／Tauri版Chlensの既存機能が回帰していない。
- Liveの設定、ルール、履歴、cacheがChlensと分離されている。
- エッヂ実況を選択、閲覧、検索、絞り込み、NG、書き込み、Overlay表示までLive単体で行える。
- ChlensとLiveをthread／response単位で相互に開ける。
- 長時間運用、複数monitor、OBS capture、network復旧が手動確認されている。

## 参考リポジトリ
V:\repos\fork\EdgeLiveViewer
