# Chlens Live Main UI 仕様

## 画面の基本構造

Chlens LiveのMainは、Chlens browser viewと同じ次のshellを使う。

```text
Main window viewport
┌──────────────────────────────────────────────┐
│ TabBar                                       │
├──────────────────────────────────────────────┤
│ URL bar（常時表示）                           │
├──────────────────────────────────────────────┤
│ ContentArea                                  │
│   ThreadListView または ThreadView（1つだけ） │
└──────────────────────────────────────────────┘
```

- タブバーは開いているページを切り替える。
- URLバーは折りたたまず、常に表示する。board URL／thread URLの入力入口もここに置く。
- ContentAreaはviewportに収まる1ページ分の表示領域とする。
- TabBarとURLバーはContentAreaの外側に置き、ウィンドウ枠内に常時固定する。スクロールするのはContentAreaだけとする。
- ThreadListViewとThreadViewを左右・上下に同時表示する2ペイン構成にはしない。
- Overlayの表示・非表示はURLバー右側の1つのアイコンボタンで切り替える。クリック透過の切り替えと手動の位置保存操作は提供しない。

## ページ単位の表示

### ThreadList page

ContentAreaにはスレ一覧だけを表示する。

- 一覧はChlensと同じ`SimpleDataTable`を使用する。
- タイトル検索、勢い順／新着順などのsort、NG／highlightはcontrollerからpropsで渡す。
- 行クリックまたは中クリックでThread pageを新しいタブとして開く。
- Liveでは不要なbookmark、board navigation、2 pane操作を表示しない。不要なボタンをCSSで隠して残すのではなく、actionを渡さない。

### Thread page

ContentAreaには選択したスレだけを表示する。

- ThreadList pageを横に残さない。
- レス一覧、検索、filter、NG表示、refresh／stop操作はThreadViewの責務とする。
- MainとOverlayは同じLive Session snapshotを利用し、ThreadViewがOverlay用の取得を行わない。

## Windowとの関係

- Mainは操作と全レス確認のための通常windowとする。
- OverlayはMainのContentAreaとは別の透明windowで、新着レスのprojectionだけを表示する。
- Overlayの操作バーとリサイズ枠は常時表示する。
- Overlayの位置・サイズは移動・リサイズ後に自動保存する。
- Overlay操作の存在によってMainのページ構成を複雑にしない。

## 更新

- スレ一覧は自動更新しない。URLバーのrefreshアイコンで明示的に更新する。
- スレ本文は10秒間隔で自動更新する。

## 既存Chlensとの対応

| Chlens | Chlens Live |
| --- | --- |
| `TabBar` | `LiveBrowserShell`内のLive tab bar |
| `NavigationBar`／URL bar | 常時表示のLive URL bar |
| `ContentArea` | `live-content-area` |
| `ThreadListPage` | Live controller + `ThreadListView` + `SimpleDataTable` |
| `ThreadPage` | Live controller + `ThreadView` |

この仕様では画面の骨格をChlensへ合わせ、取得・session・Overlay・Live専用操作だけをLive側のcontroller／compositionに残す。
