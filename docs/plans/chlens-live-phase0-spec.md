# Chlens Live Phase 0 仕様・既存挙動固定

## 目的

Phase 0では、Chlens Liveの実装を始める前に、既存Chlensで維持する挙動とLiveで採用する初期スコープを固定する。
この文書はロードマップのPhase 0に対応する作業メモであり、未決事項をコードから推測して決定しないための基準とする。

## 対象範囲

### Chlens Live MVPに含めるもの

- エッヂ（`bbs.eddibb.cc`）のスレ一覧
- 勢い順／新着順の一覧ソートとスレタイ検索
- エッヂのスレURLまたはthread IDからのスレ表示
- スレ内検索と、全て／多レス／画像／動画／リンクの5種filter
- スレッド／レスのNG・highlight DSL
- 閲覧タブとactive Live Sessionの分離
- 1回の取得結果をMainとOverlayへ投影する構成
- 透明、常に手前、クリック透過、font／speed／opacityのOverlay設定
- 接続エラー表示、再接続、window geometry保存

### Main画面の構成

- Chlensと同じく、タブバー、常時表示URLバー、ContentAreaを上から配置する。
- ContentAreaはviewportに収まる1ページ1ビューとし、ThreadList pageではスレ一覧だけ、Thread pageではスレだけを表示する。
- ThreadListとThreadを同時に表示する2ペイン構成は採用しない。
- 一覧表はChlensと同じ`SimpleDataTable`を利用する。

### MVPに含めないもの

- 書き込み、書き込み履歴
- 自動次スレ切替
- 過去ログのplayback
- 閲覧履歴、取得済みログ検索
- ChlensからLiveを開く相互起動
- お気に入り、Live独自の板一覧、2ペイン表示

ただし、後続機能を追加できるように、session、history repository、bridge、playback sourceの境界はMVPの設計時点で閉じない。

## エッヂURL／thread ID入力仕様（Phase 0で固定する契約）

### 受け付ける入力

| 入力                | 例                                                         | 正規化後の扱い                                             |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| エッヂの簡略スレURL | `https://bbs.eddibb.cc/liveedge/1742132339/`               | `/test/read.cgi/liveedge/1742132339/` と同一スレとして扱う |
| read.cgi形式        | `https://bbs.eddibb.cc/test/read.cgi/liveedge/1742132339/` | 末尾スラッシュを含むcanonical thread URLへ統一             |
| thread ID           | `1742132339`                                               | 初期対象board `liveedge` と組み合わせてスレURLを生成       |

既存の`ChURL`／内部ルーティングが返すcanonical thread URLは、現時点では
`http://bbs.eddibb.cc/test/read.cgi/{board}/{thread}/`とする。取得adapterのTLS対応を変更する場合は、
identity（boardとthread ID）と表示URL（protocol）を分離して、同一スレ判定を壊さない。

- URLのhostは `bbs.eddibb.cc` に限定する。
- board名は英数字・`_`・`-`を許可し、空文字は拒否する。
- thread IDは10進数の正整数として解釈し、レス番号やクエリ文字列はthread identityに含めない。
- `http`／`https`、簡略形式／read.cgi形式、末尾スラッシュの違いは同じthread identityへ正規化する。
- エッヂ以外のURL、boardだけのURL、形式不正のIDはLive Sessionを開始せず、入力エラーを表示する。
- 正規化されたURLは取得・cache・session比較のキーに使う。レスへのジャンプ番号は別フィールドで扱う。

既存コードでは `packages/ch-lib/src/url/patterns.ts`、`packages/ch-lib/src/url/ChURL.ts`、`src/view/browser/utils/link-routing.ts` がこの入口を担当している。Phase 2で共通APIへ移す際も、この契約を変えない。

## EdgeLiveViewer機能の対応表

| EdgeLiveViewerの機能       | Chlens Liveでの扱い | 導入phase | 備考                                            |
| -------------------------- | ------------------- | --------- | ----------------------------------------------- |
| スレ一覧（勢い順／新着順） | 継承                | 4／6      | エッヂ固定boardのcontrollerを用意する           |
| URL／ID直接入力            | 継承                | 6         | 上記の入力契約を使用する                        |
| リアルタイム取得           | 再設計              | 6         | `LiveThreadSession`だけが取得する               |
| 透明コメント表示           | 再設計              | 7         | MainとOverlayで同じsnapshotを使う               |
| コメント速度・レーン       | 再設計              | 7         | `baseSpeedPxPerSecond`モデルへ変更する          |
| ID／名前／本文NG           | 再設計              | 3／7      | ChlensのDSL evaluatorを利用し、保存先は分離する |
| 次スレ自動検出             | 継承                | 8         | MVPには含めない                                 |
| 書き込み                   | 継承                | 8         | own response照合を追加する                      |
| 過去ログ再生               | 継承                | 8         | playback clockを追加する                        |
| 画像／GIF表示              | 継承                | 8         | media renderer境界を先に確保する                |
| 設定・window geometry      | 再設計              | 7         | Live専用storageへ保存する                       |
| Pythonコードの直接再利用   | 廃止                | —         | TypeScript／Tauriの境界へ移植する               |

## 既存挙動の固定状況

| 契約                              | 現在の根拠                                                                                                                                                                   | Phase 0の判定 | 追加確認                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| ThreadListの板別検索復元          | `src/view/browser/pages/ThreadListPage.test.tsx`                                                                                                                             | 固定済み      | Liveではboard固定のcontrollerに置き換える                        |
| ThreadListの自動更新              | `src/view/browser/pages/ThreadListPage.test.tsx`                                                                                                                             | 固定済み      | 非active tabで発火しないことを維持する                           |
| URL正規化・同一thread判定         | `src/view/browser/utils/link-routing.test.ts`、`src/content-scripts/url-targets.test.ts`、`packages/ch-lib/src/url/*`                                                        | 固定済み      | エッヂ入力契約を追加する                                         |
| 5種のレスfilter                   | `src/view/browser/types.ts`、`src/view/browser/hooks/use-thread-data.ts`、`src/view/browser/hooks/use-thread-data.contract.test.tsx`                                         | 固定済み      | filter切替と検索の組合せをfixtureで固定した                      |
| 指定レスジャンプ                  | `src/view/browser/utils/thread-read-state.test.ts`、`src/view/browser/pages/thread/use-thread-res-context-menu.test.tsx`                                                     | 固定済み      | filter解除後にDOM更新を待ってジャンプすることを固定した          |
| auto refreshとread state          | `src/view/browser/hooks/use-auto-refresh.test.tsx`、`src/view/browser/pages/thread/use-thread-read-state.ts`、`src/view/browser/pages/thread/use-thread-read-state.test.tsx` | 固定済み      | 新着差分で既読番号を巻き戻さず、最下部だけ追従することを維持する |
| popup／anchor preview／reply tree | `src/view/browser/hooks/use-popup-manager.contract.test.tsx` ほか                                                                                                            | 固定済み      | 共有viewへ移す際にfacadeを維持する                               |
| NG／highlight DSL                 | `src/core/rules/*.test.ts`、`src/core/NG*.test.ts`                                                                                                                           | 固定済み      | `engine.test.ts`でboard／thread／responseのscope境界を固定した   |
| 閲覧履歴                          | `src/core/History.*.test.ts`、`src/view/browser/pages/HistoryListPage.test.tsx`                                                                                              | 固定済み      | Live adapterの保存先は別にする                                   |
| 書き込み履歴                      | `src/core/WriteHistory.*.test.ts`、`src/view/browser/pages/WriteHistoryListPage.test.tsx`                                                                                    | 固定済み      | 正規化URLと保存レス番号からjump targetを作る契約も固定済み       |

## Phase 0で追加・確認する契約テスト

優先順位をつけ、既存実装の挙動を変えずにcharacterization testとして追加する。

1. **完了** `useThreadData`またはThread表示のfixtureテスト
   - 全て／多レス／画像／動画／リンクの各filter
   - filterと本文・名前・ID検索の組合せ
   - filter解除後に指定レスジャンプが可能であること
2. **完了** auto refreshとread stateの連携テスト
   - 新着レスを反映しても既読位置を不必要に巻き戻さない
   - 最下部にいる場合だけ差分分の自動追従を行う
3. **完了** DSLのscope characterization test
   - board、thread、responseの同一sourceに対する判定結果
   - hideとhighlightの優先・対象範囲
4. **完了** write historyからのレス遷移テスト
   - 正規化前後のthread URLが同一threadとして扱われる
   - 保存されたレス番号をjump targetへ渡す

実装が複雑になる場合は、Phase 0で新しい共通moduleを作らず、既存hook／utilityの公開挙動をテストする。抽出やpackage化はPhase 1以降のIssueで行う。

## 完了条件

- MVP必須機能、後続機能、スコープ外がこの文書で区別されている。
- エッヂURL／thread IDの受け付け範囲とcanonical identityが決まっている。
- EdgeLiveViewerの各機能に継承／再設計／廃止の分類がある。
- 既存挙動の根拠となるテストファイルが一覧化されている。
- 不足契約テストが追加され、`pnpm test`で通る。
- Phase 0のテストIssueと、Phase 1以降のリファクタリング／Live機能Issueが混ざっていない。

## 未決事項

以下はコードから安全に決められないため、人の確認後に確定する。

- 初期対象boardを常に`liveedge`に固定するか、接続前にboardを選択可能にするか
- Mainを閉じたときに終了確認を出すか、tray常駐へ移行するか
- Overlayの初期サイズ、初期opacity、click-throughの既定値
- Live Sessionの既定poll間隔と、rate limit時の再試行上限
- EdgeLiveViewerの画像表示・書き込みUIのうち、MVP後も維持する範囲

これらを推測で実装せず、Phase 1のIssue作成前に決定する。

## 初回実装確認（2026-08-23）

- `src/view/browser/hooks/use-thread-data.contract.test.tsx` に5種filterと検索の契約テストを追加した。
- `pnpm exec vp test run`: 97 test files、501 testsが成功した。
- `pnpm tsc6`: 成功した。
- 新規テストのformat・lint・型チェック: 成功した。
