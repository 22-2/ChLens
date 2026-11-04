# ワークスペースの窓とビュー移動の計画

- ブランチ: `feature/workspace-windows`（`develop` から作成）
- 状態: Phase 1・2 完了。Phase 0 の実環境調査は継続中（2026-11-05 更新）

## 1. 目的と範囲

Obsidian や VS Code のように、タブ（ビュー）を窓とペインの間で自由に移動できるようにする。

- すべてのページ種別を同じ仕組みで別窓に出せる（2026-11-05 に実装済み。コミット `e455be44`）。
- 別窓もタブバーを持ち、複数のタブを置ける。本窓と別窓は同じ種類の「窓」として扱う。
- タブを窓の間・ペインの間でドラッグして移動できる。窓の外へドラッグしたら新しい窓にする。
- 対象はブラウザ拡張（Chrome・Firefox）と Tauri（Windows）の両方。
- 窓をまたぐドラッグを含む。

### 範囲外

- 自由な分割ツリー（上下・入れ子の分割）。ペインは窓ごとに横並び（最大 `MAX_PANES` = 2）のままにする。`extension-points-plan.md` §3.4 の「自由な分割ツリーは作らない」の方針を維持する。必要になったら Phase 7 で別に検討する。
- ペイン内でのタブ以外（サイドパネルのビューなど）の窓間移動。
- 窓をまたぐ複数選択ドラッグ。
- コメントOverlay・過去実況再生の窓。これらは別の Tauri 窓（別の JS 実行環境）で、今回の「窓」の対象にしない。

## 2. 現状（2026-11-05 の調査）

### 2.1 データモデル

- `TabStoreState`（`src/view/browser/state/tabs/tab-store-types.ts`）は、横並びの `panes: Pane[]`、`activePaneId`、全体で共有する `closedTabs`、`sidePanel`、ペインID単位の `bottomPanels` を持つ。
- `Pane` は `id`・`tabs`・`activeTabId` だけで、どの窓に属すかを持たない。
- ペイン間のタブ移動（`MOVE_TAB_TO_PANE`）、入れ替え（`SWAP_PANE_TABS`）、分割（`SPLIT_PANE`、`OPEN_IN_RIGHT_PANE`）は既にある。タブバー内の並べ替えは `MOVE_TAB`（`{ dragTabId, toIndex }`）という名前で既にある。
- ペイン数の上限は `state.panes.length < MAX_PANES` のように全体の数で判定している（`tab-store-selectors.ts`、`tab-store-reducer.ts`）。
- `activePaneId` は、外部リンク・MCP・全体のショートカットなど、操作元のペインが分からない処理の暗黙の宛先になっている。
- `useTabPanes()` は全ペインを返す。呼び出し元（11 か所）には、全ペインを前提にするもの（書き込み先の収集 `use-write-session.tsx`、別窓の管理 `TabWindowHost.tsx`、既読の同期 `use-thread-list-read-state-sync.ts`）と、表示中の窓のペインだけを見たいもの（`App.tsx`、`SharedTabBar.tsx`、`NavigationBar.tsx` など）が混ざっている。
- セッション保存（`tab-store-session.ts`）は `panes`・`sidePanel`・`bottomPanels` を保存する。別窓は保存しない。

### 2.2 別窓の仕組み

- 本窓がすべての React ツリーを持つ。別窓は `window.open` で得た `WindowProxy` の `document` へ `createPortal` で描画する（`shell/TabWindowHost.tsx`、`features/auxiliary-window/browser/`）。状態は 1 つの `TabStore` を共有する。
- 切り離したタブは、本窓のペインに所属したまま「別窓にある」というレジストリ上の印（`DetachedTabController.isDetachedTab`）だけで表す。本窓の表示・タブバー・`activeTabId` の補正（`ensureVisibleActiveTab`）が、この印を見て切り離し中のタブを除外している。
- 別窓の中身（`DetachedTabWindowContent`）は、本窓の `App.tsx` の `PaneColumn`・`ShellFrame` とは別に組み立てた簡易版で、タブバー・オムニバー・サイドパネルを持たない。
- 窓の終了は、`beforeunload` ではなく親窓から `closed` を 250ms 周期で確認する（再読み込みと区別するため）。OS の × は現状「そのタブを閉じる」。
- 本窓の `pagehide`（再読み込み・終了）で、別窓を明示的に閉じる（`auxiliary-window-watcher.ts`）。再読み込み後の本窓は元の `WindowProxy` を持たず、別窓が抜け殻として残るため。
- 「切り離し中」を参照する箇所: `ContentArea`、`BottomPanel`、`CommentOverlayJumpBridge`、`WindowNavigationBridge`、`TabContextMenu`、`use-tab-bar-model`。

### 2.3 プラットフォーム

- ブラウザ拡張: `window.open` で別窓を作る。ポップアップブロックを避けるため、クリックなどの操作と同じ同期処理の中で開く必要がある。
- Tauri: `window.open("")` を Rust の `on_new_window` が受け、`chlens-popup-N` のラベルでネイティブ窓を作る（`src-tauri/src/lib.rs`）。**本窓の再読み込み（`PageLoadEvent::Started`）で `chlens-popup-*` を全部閉じる。** `WindowProxy` を失った窓が残らないようにするため。
- Tauri の窓ラベル（`chlens-popup-N`）は Rust の `on_new_window` が連番で決める（`src-tauri/src/lib.rs`）。JS 側の窓ID とは対応しない。
- Tauri の窓には `dragDropEnabled` の指定がなく、既定でネイティブのファイルドロップが有効になる。Windows ではこれが有効だとページ側の HTML5 のドラッグ＆ドロップが正しく届かないことが知られている。いま HTML5 のドラッグ＆ドロップを使う箇所（`SimpleDataTable.tsx` の列の並べ替え）がある一方、ファイルのドロップを受ける処理（Tauri の `onDragDropEvent`、ファイルを受ける `onDrop`）はない。そのため無効にしても失う機能はない見込み。HTML5 のドラッグ＆ドロップが窓の間で働くかは未確認。
- ブラウザの `window.open` は、ユーザー操作の直後の短い間（Chrome では約 5 秒）だけ許される。`dragend` や `pointerup`（マウス）自体はユーザー操作として数えられず、ドラッグの開始（`pointerdown`）から時間が経つとブロックされうる。
- 拡張機能には `browser.windows.create` があり（`src/app/platform/browser/WindowManager.ts`、`src/background.ts` で使用）、ポップアップブロックの対象にならない。拡張のページを開いた窓は `extension.getViews({ windowId })` で `Window` を得られる可能性があり、得られれば今と同じく Portal で描ける（未確認）。

### 2.4 ドラッグ

- タブバーの並べ替えは `@dnd-kit/react` を使う（`components/sortable-tab.ts`、`features/tabs/ui/TabBarView.tsx`）。ポインタイベント方式で、`DragDropManager` は 1 つの `document` に閉じている。窓をまたぐ移動は想定していない。

## 3. 設計方針

### 3.1 窓を第一級の概念にする

`Pane` に `windowId` を加え、窓に属するペインを窓ごとに引けるようにする。`panes` は平らな配列のままにして、reducer と保存形式の変更を小さくする。

```
Window  { id, kind: "main" | "aux", activePaneId, bounds? }
Pane    { id, windowId, tabs, activeTabId }          // windowId 省略 = main
```

- 本窓は常に 1 つ。`windowId` を持たない旧セッションの `Pane` は本窓として読む。
- `TabStoreState` に `windows` を加え、窓ごとの `activePaneId`・位置とサイズを持つ。
- `activePaneId` は 2 つの意味に分ける。
  - `TabStoreState.activePaneId`（全体）: 最後にフォーカスした窓の中のフォーカス中ペイン。外部リンク・MCP・全体のショートカットなど、操作元が分からない処理の宛先はこれまでどおりこの値にする。窓のフォーカスが移ったら、その窓の `activePaneId` へ更新する。
  - `windows[].activePaneId`（窓ごと）: その窓の中でフォーカス中のペイン。窓のタブバーやキー操作の宛先に使い、窓を前面に戻したときに全体の値へ写す。
  - Phase 1 では本窓しかないため、2 つの値は常に同じになる。
- ペイン数の上限 `MAX_PANES` は窓ごとに数える。全体の数で判定すると、別窓が 1 つあるだけで本窓を分割できなくなるため。
- 「切り離し中」の印をやめる。別窓にあるタブは、別窓に属するペインの `tabs` に入っている。`isDetachedTab` と `ensureVisibleActiveTab` は不要になる。
- 下部パネル・サイドパネルの配置はペインID単位のまま、窓単位の値は `windows` に載せる。

### 3.2 窓の範囲を React の文脈で表す

既存の `PaneProvider`・`TabViewScopeProvider`・`ViewSurfaceProvider` と同じ流儀で、`WindowScopeProvider`（`windowId`）を足す。

- ペインの読み取りは、窓ごとと全体を別の名前のフックに分ける。既存の `useTabPanes` の意味を黙って変えると、全ペインを前提にした呼び出し元（書き込み先の収集、窓の管理、既読の同期）が別窓のペインを見落とすため。
  - `useWindowPanes()`: 文脈の窓に属するペインと、その窓の `activePaneId` を返す。タブバー、ペインの並び、オムニバーなどが使う。
  - `useAllPanes()`: 全窓のペインと全体の `activePaneId` を返す。窓をまたいで 1 つの機能が使う。
  - `useTabPanes` は Phase 1 で呼び出し元をどちらかへ振り分けて削除する。どちらの意味で使っているかを名前で読めるようにするため。

- 本窓のシェル（`App.tsx` の `ShellFrame`・`PaneRow`・`PaneColumn`）を、窓に依存しない `WindowShell` として切り出す。本窓も別窓もこれを使う。
- 窓の種類による差はシェルの設定で表す（本窓: サイドパネルあり、別窓: 初期はサイドパネルなし。オムニバーはどちらにも置く）。共通部分を複製しない。
- 窓ごとに持つもの: タイトルバー、タブバー、トースト、ステータスバー、下部パネルの開閉、キーボードショートカットの受け付け、コマンドパレット、ポップアップ・メニュー・ダイアログの描画先。後半の 3 つは窓ごとの `document` でイベントを受けて描くため、今の簡易版の別窓では揃っていない。窓をまたいで 1 つのもの: 書き込みセッション（編集欄は 1 か所に限る。`WriteSessionProvider` の既存仕様）、閉じたタブ履歴、設定。

### 3.3 窓の寿命

- `TabWindowHost` を `WindowHost`（窓単位）に作り直す。`WindowProxy`・終了監視・再接続・タイトル更新は既存の `auxiliary-window` を再利用する。
- 利用者が窓を閉じたとき（OS の ×、最後のタブを閉じた場合を含む）は、その窓のタブをすべて閉じた扱いにして `closedTabs` に積む。「閉じたタブを開く」で本窓へ復元できる。窓の再読み込みでは閉じない（現状どおり）。
- 本窓の再読み込み・終了で別窓を閉じる挙動は変えない（Tauri は Rust の `PageLoadEvent::Started`、ブラウザは本窓の `pagehide` で閉じる）。この閉じ方は利用者の操作ではないため `closedTabs` に積まず、別窓のタブはセッションに残す（§3.7）。
- 2 つの閉じ方を区別するため、終了の原因（利用者の操作／本窓に連動）を `WindowHost` が判定してから dispatch する。

### 3.4 移動操作

窓とペインの間の移動は、次の 1 つの操作で表す。

```
TRANSFER_TAB { tabId, to: { windowId, paneId, index } | { newWindowId, bounds? } }
```

- 名前は `MOVE_TAB` にしない。タブバー内の並べ替えが `MOVE_TAB`（`{ dragTabId, toIndex }`）として既にあり、同じ名前で意味の違う操作を作ると取り違えるため。
- 既存の `MOVE_TAB_TO_PANE` は `TRANSFER_TAB` で置き換えて削除する（同じ窓の別ペインへの移動は `to.windowId` が移動元と同じ場合）。2 つを残すと、窓の判定を片方にだけ足す取りこぼしが起きるため。`MOVE_TAB`（同じペイン内の並べ替え）は今のまま残す。
- 新しい窓への移動では、`WindowHost` が先に窓を確保して `windowId` を決め、それを `newWindowId` として渡す。reducer は渡された ID で `windows` に窓を加える。
- 窓の新規作成は、ポップアップブロックを避けるため、ユーザー操作と同じ同期処理の中で `window.open` を呼ぶ必要がある。reducer は純粋に保ち、窓を開く副作用は `WindowHost` が担当する。操作は「窓を先に確保し、成功したら移動を dispatch する」順にする（失敗したらタブはそのまま）。
- ブラウザ拡張では、Phase 0 の結果次第で `window.open` の代わりに `browser.windows.create` と `extension.getViews` を使う（§2.3）。使えればユーザー操作の制約がなくなり、ドラッグの終わりでも起動時の復元でも窓を開ける。

### 3.5 窓をまたぐドラッグ

DOM イベントは窓ごとの `document` で発火するため、窓をまたぐ移動は 1 つの共有コントローラ（`TabDragController`）が担当する。React は全窓で同じ JS 実行環境にあるので、ドラッグ状態は 1 つの共有ストアで持てる。

| 案 | 仕組み | 見込み |
| --- | --- | --- |
| A. HTML5 DnD | タブに `draggable` を付け、ドラッグ状態は共有ストアで持つ。ブラウザが窓の間のイベントを配送する。 | 実装が簡単。Tauri は `dragDropEnabled` の無効化が要る（ファイルのドロップを受ける機能はないため、失うものはない見込み。§2.3）。ドラッグ画像の制御が弱い。窓の外で離したときは `dragend` しか届かず、新しい窓を開くとブロックされうる。 |
| B. ポインタ＋画面座標 | 発生元の窓でポインタをキャプチャし続け、`screenX/screenY` で他窓の矩形に当てはめる。表示する挿入位置の目印は各窓の DOM に React から描く。 | 見た目を完全に制御できる。窓の重なり順が分からない・DPI やマルチモニターの座標ずれが課題。Tauri はネイティブのカーソル位置（`cursorPosition`）で補強できる。 |

どちらにするかは Phase 0 の調査で決める。どちらでも、次の仕様は同じにする。

- 同じタブバー内の並べ替えは今の `@dnd-kit/react` を使い続ける。タブバーの外へ出たら窓をまたぐドラッグへ切り替える。
- ドロップ先は、タブバー上（挿入位置）、ペインの中央（そのペインの末尾へ追加）、ペインの左右端（ペインが `MAX_PANES` 未満なら分割して移動）。
- どの窓にも当たらない場所で離したら、その位置に新しい窓を作って移動する（ブラウザのタブの切り離しと同じ）。ブラウザで窓を開けなかったとき（ユーザー操作の期限切れによるブロック）は、タブを元の位置に残し、トーストで「窓へ移動」メニューを案内する。
- Esc でキャンセル。ドラッグ中は元の窓でそのタブを薄く表示する。

必ず使える代替として、タブのメニューとコマンドパレットに「窓へ移動」（既存の窓の一覧と「新しい窓」）を用意する。ドラッグが環境によって使えなくても、移動はできる。

### 3.6 プラットフォームの抽象

`src/app/platform/` の `WindowManager` に、窓の位置とサイズの取得・設定、窓の前面化を足す（ブラウザ版は `window.screenX` 系と `moveTo`/`resizeTo`、Tauri 版は `TauriWindow.getByLabel` 経由）。呼び出し側はプラットフォームを意識しない。

### 3.7 段階の途中のセッション

別窓のペインが状態に入るのは Phase 3 から、別窓を復元できるのは Phase 6 からになる。その間に再起動や本窓の再読み込み（別窓も閉じる。§2.2）をすると、`windowId` 付きのペインを戻す先がない。

- Phase 1 から、保存形式は `windows` と `Pane.windowId` を含む新形式にする（Phase 6 で形式を変えずに済ませるため）。
- Phase 6 までは、読み込み時に別窓のペインを本窓へまとめる。別窓のペインのタブを、本窓のフォーカス中ペインの末尾へ順に移し、`windows` は本窓だけにする。タブを失わないことを優先し、窓の構成は戻さない。
- Phase 6 でこのまとめる処理を、復元できない環境だけの代替に切り替える。

## 4. 段階ごとの計画

各段階の終わりで、アプリが動く状態を保つ。段階ごとにコミットを分ける。

### Phase 0: 調査（コードはサンプルのみ・製品には入れない）

調査メモ（2026-11-05）:

- Playwright の Chromium（ヘッドレス、Manifest V3 の独立した拡張）で、ユーザー操作なしに `chrome.windows.create` から拡張ページを開き、親ページの `chrome.extension.getViews({ windowId })` で取得した `Window` の DOM に React Portal を描画できた。`chrome.windows.remove` 後は取得済みの `Window.closed` が `true` になった。
- 同じ Chromium で Playwright の `--disable-popup-blocking` 既定引数を外し、読み込みから 6 秒後に操作なしで `window.open` と `chrome.windows.create` を試すと両方とも成功した。これはヘッドレスの拡張ページでの結果で、ドラッグ終了時や製品版 Chrome の挙動を保証しない。
- 同じ条件で CDP のマウス操作による HTML5 ドラッグを 6 秒以上続け、ページ外の座標で離した場合も `dragend` に到達し、`navigator.userActivation.isActive` が `false` でも `window.open` は成功した。CDP によるページ外の座標指定であり、OS の実際の窓外へのドラッグは未確認。
- Firefox 157.0（Playwright 配布版、`web-ext` で一時的に読み込んだ Manifest V2 拡張）でも、ユーザー操作なしの `window.open` と `browser.windows.create`、`getViews` で取得した文書への React Portal の描画を確認した。作成した窓の再読み込み後も `getViews` で取得でき、`windows.remove` 時には `windows.onRemoved` が届いた。削除後に保持していた `Window.closed` を読むと dead object の例外になったため、Firefox では終了監視に `onRemoved` を使う候補がある。
- Tauri の E2E ビルド（WebView2、既定設定）では、CDP からユーザー操作なしで `window.open` による空の別窓を作り、親からその文書を変更できた。同一窓内の HTML5 ドラッグでは `dragstart`・`dragover`・`drop`・`dragend` が届いた。ドラッグ開始時には `lostpointercapture` も発生した。別窓へ届くか、実際のマウス操作や `dragDropEnabled` 無効時の挙動は未確認。
- 利用者が Chrome の通常ページで調査用サンプルを手動操作し、別窓への `dragenter` と `drop`、元窓の `dragend` を複数回確認した。ドラッグ開始後に元窓で `pointercancel` も発生した。拡張ページや Tauri での動作はこの結果には含まれない。
- [Tauri の設定リファレンス](https://v2.tauri.app/reference/config/#dragdropenabled)は、Windows で HTML5 ドラッグ＆ドロップを使うにはネイティブのドロップ処理を無効にする必要があると説明している。上記の CDP 操作は OS を経由したドロップの代わりにならないため、この記述を覆す根拠にはしない。
- インストール済み Chrome ではコマンドラインからの一時拡張の読み込みを試したが、拡張のサービスワーカーを検出できず調査を完了できなかった。Chromium で確認した結果を Chrome の結果としては扱わない。
- 拡張ページと Tauri での窓間ドラッグ、再起動時の復元、複数モニターでの座標は未確認。窓を開く方法とドラッグ方式の採用判断は保留し、以下の調査を続ける。
- 調査環境にはモニターが 3 台あるが、Windows の `GetDpiForMonitor` で取得した DPI はいずれも 96 だった。倍率の異なる組み合わせの確認は、利用者の指定によりスキップする。

- 窓をまたぐドラッグの案 A・B を、Chrome 拡張と Tauri の両方で試す。確認する項目:
  - 窓の間でイベントが届くか。窓の外でボタンを離したときの扱い。
  - 窓の重なり順とマルチモニターでの座標（倍率の異なる環境はスキップ）。
  - Tauri の `dragDropEnabled` を切ったとき、`SimpleDataTable` の列の並べ替えなど既存の HTML5 のドラッグ＆ドロップが動くか。
  - ドラッグを始めてから 5 秒以上経って窓の外で離したとき、`window.open` がブロックされるか。
- ブラウザ拡張で `browser.windows.create` で開いた窓に、`extension.getViews({ windowId })` で得た `document` へ Portal で描けるか。描ける場合の、再読み込み・終了の監視（`closed` の代わりに `browser.windows.onRemoved` を使えるか）。Chrome と Firefox の両方。
- 起動時に別窓を復元できるか。ポップアップブロックの有無（ユーザー操作なしで `window.open` できるか）。Firefox を含む。
- 完了条件: 採用する案と、できない環境の代替を、この文書の §3.5 に追記する。ブラウザ拡張で窓を開く方法（`window.open` か `browser.windows.create` か）を §3.4 に追記する。

### Phase 1: データモデルに窓を導入する（見た目の変更なし）

完了（2026-11-05）: 窓の状態と文脈、ペイン取得の分離、窓ごとのフォーカス・ペイン上限、セッション移行を実装。別窓の復元は Phase 6 まで本窓への集約で代替する。ユニットテスト全体（410 ファイル、3,315 件）と TypeScript の型チェックを通過。

- `Pane.windowId`・`TabStoreState.windows` を足し、本窓だけが存在する状態にする。
- セレクタを窓単位にし、`WindowScopeProvider` を足す。本窓は文脈なしで従来どおり動く。
- `useTabPanes` の呼び出し元を `useWindowPanes`・`useAllPanes` へ振り分け、`useTabPanes` を削除する（§3.2）。
- `activePaneId` を全体と窓ごとの 2 つに分ける（§3.1）。ペイン数の上限を窓ごとに数える。
- セッションを新形式で保存し、旧形式を本窓として読めるようにする。別窓のペインは本窓へまとめて読む（§3.7）。
- 完了条件: 既存のテストが、`useTabPanes` の名前の置き換え以外は変更なしで通る。旧セッションの読み込み、別窓のペインを本窓へまとめる読み込み、窓ごとのペイン上限のテストを足す。

### Phase 2: シェルを窓に依存しない部品にする

完了（2026-11-05）: ペインとシェルの構成を `WindowShell` に切り出し、サイドパネルの表示設定を追加。ナビゲーションの受け口は表示先の `document` から検索する。Chrome の初期画面（1280×800）の前後画像は画素単位で一致し、Chrome の関連 E2E 3 件とユニットテスト全体（410 ファイル、3,316 件）を通過。

- `App.tsx` の `ShellFrame`・`PaneRow`・`PaneColumn` を `WindowShell` へ切り出し、本窓がそれを使う。
- 別窓向けにサイドパネルを省く設定を用意する（まだ使わない）。オムニバー（`NavigationBar`）は別窓にも置くため、ペインIDごとのポータル先（`side-panel-sublens-plan.md` のタイトルバー共通化で挙げた競合）を窓単位に整理する。
- 完了条件: 本窓の見た目・操作が変わらない（スクリーンショットの回帰で確認）。

### Phase 3: 別窓を同じ仕組みへ移行する

完了（2026-11-05）: 別窓を窓単位のシェルへ移行し、窓を閉じたときの履歴と本窓再読み込み時のタブ集約を実装。Chrome と Tauri の E2E で別窓の開閉、移動と復帰、複数タブの再読み込み後の集約を確認した。

- `TabWindowHost` を窓単位の `WindowHost` に置き換え、別窓は `WindowShell` を描画する（タブバー付き）。
- 「切り離し」は「新しい窓を作ってタブを移す」に置き換える。`isDetachedTab`・`ensureVisibleActiveTab`・`hostedInTabWindow` と、§2.2 末尾の参照箇所を整理する。
- 窓を閉じたときの扱い（§3.3。利用者の操作と本窓に連動した終了の区別を含む）と、別窓内の「新しいタブで開く」が別窓のペインに開く挙動を確認する。
- 別窓でもキーボードショートカット・コマンドパレット・ポップアップ・メニューが、その窓の `document` で動くようにする（§3.2）。
- 完了条件: 切り離し・戻す・OS の × の既存テストが、新しい意味に合わせた形で通る。Chrome と Tauri の E2E で別窓を開閉できる。別窓を開いたまま本窓を再読み込みしても、別窓のタブが本窓に残る。

### Phase 4: ドラッグなしの移動

完了（2026-11-05）: `TRANSFER_TAB` を唯一の移動手段にし、`MOVE_TAB_TO_PANE` を削除した。タブのメニューに移動先（反対側のペイン、メイン画面、別窓）を並べ、コマンドパレットに「次のペイン・窓へ移動」を追加した。移動してもタブの実体（履歴、固定、自動更新の状態）は同じオブジェクトのまま移る。下部パネルの配置はペインごとの保存で、タブには結び付かない。Chrome の E2E 7 件とユニットテスト全体（411 ファイル、3,323 件）を通過。

- `TRANSFER_TAB`（§3.4）を実装し、`MOVE_TAB_TO_PANE` を置き換える。タブのメニューとコマンドパレットに「窓へ移動」を追加する。
- ペイン間・窓間の移動で、自動更新・コメントOverlay・書き込みセッション・下部パネルの追従を確認する。
- 完了条件: 窓 2 つ・ペイン 2 つの組み合わせで、タブを任意に移動しても状態（スクロール位置、自動更新、既読）が失われない。

### Phase 5: ドラッグによる移動

- Phase 0 で決めた案で `TabDragController` を実装する。タブバー内の並べ替えは既存を維持する。
- 窓の外へのドラッグで新しい窓を作る。ペインの左右端での分割を足す。
- 完了条件: §3.5 の仕様を満たす。使えない環境ではメニューの移動が使える。

### Phase 6: 別窓の保存と復元

- 別窓の構成（所属するタブ、位置とサイズ）を保存する（形式は Phase 1 で用意済み）。§3.7 の「本窓へまとめる」読み込みを、復元できない環境だけの代替に切り替える。
- 起動時の復元は、Phase 0 で `browser.windows.create` を使えると分かったブラウザ拡張ではそのまま開く。それ以外のブラウザではブラウザではポップアップブロックを避けるため、ユーザー操作を待つ（例: 「別窓を復元」の通知から開く）。Tauri は Rust 側で作成を許可する経路を検討する。
- 完了条件: 再起動後に、別窓のタブが失われずに復元される（復元できない環境では本窓へ戻る）。

### Phase 7（任意）: さらなる自由度

- 別窓のサイドパネル。
- ペインの縦分割や入れ子（分割ツリー）。着手する場合は `extension-points-plan.md` の方針を改定する。

## 5. テスト方針

- reducer・セレクタ・セッション移行は Vitest。窓をまたぐ移動の組み合わせ（同一ペイン、別ペイン、別窓、新規窓、最後のタブ、固定タブ）を網羅する。
- `WindowHost` は既存の `TabWindowHost.test.tsx` を引き継ぎ、窓の寿命（再利用、再読み込み、OS での終了、ブロック）を確認する。
- 実機の挙動（Portal、座標、イベント配送）は Playwright の E2E で確認する。Chrome は複数ページを扱え、Tauri は `e2e-plan.md` の仕組み（CDP、非表示デスクトップ）を使う。窓をまたぐドラッグは Tauri 側の少数の spec に絞る。

## 6. リスク

| リスク | 影響 | 対応 |
| --- | --- | --- |
| 窓の間のドラッグが環境で動かない | Phase 5 が成立しない | Phase 0 で先に確かめる。代替としてメニュー移動（Phase 4）を先に出す |
| 窓の重なり順が分からず、ドロップ先を誤る | 重なった窓で別の窓へ落ちる | Tauri はネイティブの窓一覧とカーソル位置を使う。ブラウザは最後にフォーカスした窓を優先する |
| 起動時の別窓の復元がポップアップブロックされる | 復元できない | ユーザー操作を待つ導線にする。失敗時は本窓へ戻す |
| 「切り離し中」の印に依存した箇所の取りこぼし | 見えないタブへ入力が届く、二重に表示される | Phase 3 の前に参照箇所を洗い出し、型で検出できるよう印を削除する |
| 窓ごとのスコープ化で、全体に 1 つのつもりの状態が分裂する | 自動更新・通知・コマンドの対象が窓によってずれる | §3.2 の「窓ごと／全体で 1 つ」の区分に従い、新しい状態を足すたびに分類する |
| 移行期間の旧形式セッション | 復元に失敗してタブが消える | 旧形式を本窓として読む。保存形式にバージョンを持たせる |
| Phase 3〜5 で本窓を再読み込みする | 別窓が閉じ、そのタブが消える | 別窓のペインを本窓へまとめて読む（§3.7）。本窓に連動した終了は `closedTabs` に積まない（§3.3） |
| ドラッグ中にユーザー操作の期限が切れる | 窓の外で離しても新しい窓を開けない | Phase 0 で確かめ、拡張では `browser.windows.create` を検討する。開けなければタブを残してメニュー移動を案内する（§3.5） |
| `useTabPanes` の意味の取り違え | 書き込み先・既読の同期が別窓のペインを見落とす | 窓ごとと全体を別の名前のフックに分け、旧名を削除する（§3.2） |

## 7. 決めておくこと

2026-11-05 に決定した。

- [x] 窓を閉じたときのタブの扱い: 1 タブの窓も複数タブの窓も、閉じたタブとして `closedTabs` に積む（§3.3）。「閉じたタブを開く」で本窓へ復元できる。
- [x] 別窓のオムニバー（URL 入力欄）: 本窓と同じく置く。別窓から別のページへ移るための操作を、本窓へ戻さずに済ませるため。
- [x] 空になった窓: 最後のタブを別の窓へ移したときは、窓を自動で閉じる。この閉じ方では `closedTabs` に積まない（タブは移動先に残っているため）。
- [x] `activePaneId` の意味: 全体の値（最後にフォーカスした窓のペイン）と窓ごとの値に分ける（§3.1）。
- [x] ペインの読み取り: `useWindowPanes`（窓ごと）と `useAllPanes`（全体）に分け、`useTabPanes` は削除する（§3.2）。
- [x] 窓間の移動の操作名: `TRANSFER_TAB` とし、`MOVE_TAB_TO_PANE` を置き換える。`MOVE_TAB`（並べ替え）は残す（§3.4）。
- [x] Phase 6 までのセッション: 新形式で保存し、別窓のペインは本窓へまとめて読む（§3.7）。
- [x] 窓の識別名: ブラウザの名前付き窓は窓ID から決める。Tauri のネイティブラベルは従来どおり Rust 側の連番とし、アプリ内の窓ID と対応付けるために使わない。
- [ ] 窓間のドラッグの案（A/B）。Phase 0 の結果で決める。
- [ ] ブラウザ拡張で窓を開く方法（`window.open` か `browser.windows.create` か）。Phase 0 の結果で決める。

### 今後の課題

- 窓単位で戻す: タブの多い窓を閉じると `closedTabs` に何件も積まれ、上限（`MAX_CLOSED_TABS`）で古い履歴が押し出されるうえ、戻すのも 1 件ずつになる。必要になったら、閉じた窓をまとめて戻す操作を検討する。

## 8. 関連文書

- [extension-points-plan.md](extension-points-plan.md): `Workspace`・`Pane` の用語と、別窓でも定義を複製しない方針。
- [side-panel-sublens-plan.md](side-panel-sublens-plan.md): サイドパネルは「ウィンドウごとに１つ」。別窓にサイドパネルを置く場合の前提。
- [e2e-plan.md](e2e-plan.md): Tauri 版の E2E の仕組み。
