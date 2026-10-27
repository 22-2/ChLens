# 拡張ポイント（登録制）の整備計画

## 1. 目的と範囲

コマンド、サイドパネルのビュー、右クリックメニュー、キー割り当てを、直書きの一覧から「各機能が登録する一覧」へ置き換える。将来 VSCode や Obsidian のようなプラグイン API を検討するときの下地とするが、本計画では外部に API を公開しない（段階0）。

- 利用者から見た動作は変えない。表示順、ラベル、`when` による出し分け、無効化の条件を保つ。
- 各機能の定義を、その機能のディレクトリへ移す。組み立て層が機能を直接 import して一覧を作る形をやめる。
- ユーザースクリプトの読み込み、権限、manifest、API の互換性保証は範囲外とする（段階1以降で別に計画する）。

## 2. 現状（2026-10-27 時点）

| 差し込み口 | 実装 | 状況 |
|---|---|---|
| ステータスバー | `src/view/browser/components/StatusBar.tsx` の `StatusBarProvider` / `StatusBarItem` | 登録制。項目は React コンポーネントとして登録し、ペインごとのプロバイダが持つ |
| コマンド | `src/view/browser/commands/browser-commands.ts` の `BROWSER_COMMAND_DEFINITIONS`（約56件、ファイル全体で約1400行） | 静的な配列。`id`・`when`・`isEnabled`・`run` を持つ定義型はすでにある。利用側は `resolveBrowserCommands`（`shell/NavigationBar.tsx`）と `executeBrowserCommand` / `getBrowserCommandLabel`（`commands/command-executor.ts`）だけ |
| サイドパネル | `src/view/browser/shell/SidePanel.tsx` の `views`（6件） | 静的なオブジェクト。ビュー ID は `state/tabs/side-panel-state.ts` の `SIDE_PANEL_VIEWS` で固定し、保存済みの並び順の正規化にも使う |
| 右クリックメニュー | `create*MenuItems` 系の関数と各画面の直書き（約40ファイル） | 画面ごとにばらばら。コマンドと同じ操作を別に組み立てている箇所がある |
| キー割り当て | 各フック・画面の `keydown` 処理 | 散在。コマンド ID と結び付いていない |

コマンドの一部（コメント実況の流れ表示、フィルタの切り替え）は、`commands/` から機能を import できないため `CustomEvent` を経由して機能側へ伝えている。登録制にすれば、機能側が自分のコマンドを直接書ける。

## 3. 設計方針

### 3.1 汎用レジストリ

UI 部品層（`src/view/browser/`）に、差し込み口に依存しない小さなレジストリを置く。

```ts
export interface Disposable {
  dispose(): void;
}

export interface Registry<T extends { readonly id: string }> {
  register(item: T): Disposable;
  get(id: string): T | undefined;
  list(): readonly T[];
  subscribe(listener: () => void): () => void;
}
```

- 同じ ID の二重登録はエラーログを出して後の登録を拒否する（黙って上書きしない）。
- 一覧は登録順ではなく、定義側の `group` と `order` で並べる。今の表示順は移行時に `order` で再現する。
- React からは `useSyncExternalStore` で購読する。段階0では起動時に登録が終わるため頻繁な変更は想定しないが、後で無効化・再有効化を入れても描画が追従するようにしておく。

### 3.2 登録の仕方

- **import しただけで登録される作りにしない。** 各機能は `registerXxxCommands(registry): Disposable` のような関数を公開し、組み立て層（`App` など）が起動時に呼ぶ。AGENTS.md の「`index.ts` でまとめて再エクスポートしない（副作用が使わない画面やテストに入るため）」と同じ理由。
- 登録関数は `vite.config.ts` の `FEATURE_PUBLIC_MODULES` に追加する。
- テストでは、必要な機能の登録関数だけを呼んだレジストリを使う。

### 3.3 層との関係

- レジストリと定義型は UI 部品層に置くため、機能から参照してよい。
- 登録関数を呼ぶのは組み立て層だけとし、UI 部品層から機能を import しない今のルールを保つ。
- 既存の `CustomEvent` 経由の連絡は、機能側へ移したコマンドから順に直接呼び出しへ置き換える。置き換えたイベントが不要になったら削除する。

### 3.4 コマンドのコンテキスト

`BrowserCommandContext` は `dispatch` などの内部状態をそのまま渡していて大きい。段階0では形を変えずに使う。外部へ公開するときは、これとは別に狭いコンテキストを定義する（段階1で検討）。

## 4. 実装順序と完了条件

- [ ] **P0. 汎用レジストリ**
  - `Registry` と `Disposable` を追加し、二重登録・解除・購読・並び順をユニットテストで確認する。
- [ ] **P1. コマンド**
  - `BROWSER_COMMAND_DEFINITIONS` をレジストリに置き換え、`resolveBrowserCommands` / `executeBrowserCommand` / `getBrowserCommandLabel` の引数と戻り値は変えない。
  - 最初は全定義をそのまま1つの登録関数から登録し、既存テスト（`browser-commands.test.ts` など）が通ることを確認する。
  - そのあと機能に属するコマンドを機能側へ移す。候補は自動更新（`page.toggle-auto-refresh`）、次スレ（`page.search-next-thread`・`page.toggle-auto-next-thread`）、コメント実況（`page.toggle-comment-overlay`）、お気に入り（`page.toggle-bookmark`）、Imgur 画像の削除（`page.delete-*-imgur-images`）。
  - `BrowserCommandGroup` を固定の union のままにするか、登録できるようにするかを決める（7章）。
  - 完了条件：コマンドパレットの表示順・ラベル・有効状態が移行前と同じ。`browser-commands.ts` に機能固有の処理が残っていない。
- [ ] **P2. サイドパネルのビュー**
  - `ViewDefinition` を登録型にし、`SidePanel.tsx` から機能の直接 import をなくす。
  - 保存済みの並び順に未登録の ID があっても壊れないよう、`normalizeSidePanel` を登録済み ID に対して正規化する形へ変える。`SIDE_PANEL_VIEWS` は既定の並び順としてだけ残す。
  - 完了条件：既存のビューの表示・並べ替え・保存・復元が変わらない。
- [ ] **P3. 右クリックメニュー**
  - メニュー項目を「コマンド ID ＋ `when` ＋ 任意の引数」で表し、`thread/context`・`res/context` のようなメニュー ID ごとに登録できるようにする。
  - 先にスレ一覧の行（`features/thread/ui/thread-context-menu-items.tsx`）とレス（`pages/thread/use-thread-res-context-menu.tsx`）を移す。ほかのメニューは使われ方を調べてから個別に判断する。
  - コマンドの対象は今の `CommandTarget` / `CommandRequest`（`commands/command-runtime.ts`）で表せる範囲から始める。
  - 完了条件：移したメニューの項目・順序・区切り線が変わらない。同じ操作がコマンドパレットとメニューで同じ処理を通る。
- [ ] **P4. キー割り当て**
  - コマンド ID とキーの対応表を作り、コマンドパレットにキーを表示する。
  - 入力欄にフォーカスがあるときの扱い、ペインや別窓ごとの対象の決め方は、今の `keydown` 処理を調べて揃える。
  - 完了条件：移したキー操作の動作が変わらない。

各段階は1つの PR にまとめ、段階の途中でも動作が変わらない状態でマージできるようにする。

## 5. 進め方の原則

- 1回の変更では「置き場所を変える」か「動作を変える」のどちらかだけを行う。段階0では動作を変えない。
- 移行中は旧一覧と新レジストリを併用してよいが、同じ定義を両方に置かない。
- 登録の失敗（二重登録、未知のメニュー ID など）は握りつぶさず、ID と登録元を付けてログに出す。

## 6. 検証

- 各段階で `vp check` と `vp test` を通す。
- コマンドパレット、サイドパネル、移したメニューは、Chrome 版と Tauri 版の実画面で表示順と動作を確認する。別窓と2ペインでも確認する。
- 必要に応じて、移行前後のコマンド一覧（ID・ラベル・グループ・順序）を比較するテストを一時的に置く。

## 7. 判断が必要な点

- `BrowserCommandGroup` と `BROWSER_COMMAND_GROUP_LABELS` を登録できるようにするか。段階0では固定のままでもよい。
- レジストリをウィンドウ（別窓を含む）ごとに持つか、アプリ全体で1つにするか。今のコマンド定義は全体で共通、ステータスバーはペインごとのため、差し込み口ごとに決める。
- メニューにコマンド以外の項目（サブメニュー、チェック状態、動的な一覧）をどこまで登録型で表すか。
- 段階1（ユーザースクリプト）に進むかどうかと、その範囲。Chrome 版は MV3 の制約でリモートコードを実行できないため、Tauri 版限定になる見込み。
