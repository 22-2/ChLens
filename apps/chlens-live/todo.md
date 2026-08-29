
## 本命
- [ ] レス流し

```
- [Danmaku README の speed 仕様](https://github.com/weizhenye/Danmaku#speed)
- [Danmaku の DOM／Canvas renderer と live mode](https://github.com/weizhenye/Danmaku#live-mode)
- [EdgeLiveViewer の現在の既定速度](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:132)
- [EdgeLiveViewer の移動距離と速度計算](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:1253)

レーン管理は CommentCoreLibrary の allocator 構造を参考にする。ただし初期実装では通常スクロールを
中心にし、上固定・下固定を追加可能な境界だけ先に用意する。

- [CommentCoreLibrary の mode 別 allocator](https://raw.githubusercontent.com/jabbany/CommentCoreLibrary/master/src/CommentManager.js)
- [EdgeLiveViewer の現在のレーン判定](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:952)
- [EdgeLiveViewer の現在の追いつき処理](V:/repos/fork/EdgeLiveViewer/comment_animation_improved.py:453)
```
`docs\plans\chlens-live-development-roadmap.md`抜粋

課題点
コメントが即時反映されるように作れるか？

## chlensから移植・微修正
- [x] タブ名先頭にスレの状態アイコン（もちろんchlensと同じ）
- [x] レスがプレーンテキストのまま表示されるので画像やパーサ導入
- [x] ホイールで更新（スレ一覧では上、スレでは下、インディケーターもその挙動もそのまま移植）
- [x] ホイールでタブスイッチ
- [x] ホイールクリックでタブを閉じる
- [x] スレでの自動更新の挙動（chlensと同じで一番下のラインに入らないと更新しないように）
- [x] レスの右クリックメニュー（レスコピーなど）
- [x] 板が実況板としか表示されない（本来のタイトルを取得する仕組みを）
- [x] スレで、レスがいっぱいなくても[aria-label="レス一覧"]をめいいっぱい表示する
- [x] tab-bar__refresh-dividerが中途半端に短い

## 次の予定
- [ ] ステータスバー
- [ ] ステータスバーの自動更新ミニウィンドウ内容すべて（AutoRefreshStatusItem、自動次スレもそのまま移植）
- [ ] フィルタリング全般（検索、人気や動画そのほかすべてのフィルタ方式を全移植、スレ一覧、履歴などでも使う予定）

### 中～大移植
- [ ] NG機能全般（一覧での強調、スレでのNG、DSL）
- [ ] 設定画面
- [ ] コマンドパレット
- [ ] ジェスチャー
- [ ] 書き込み
- [ ] 履歴
- [ ] 画像ビューア

ちょっとまてよ🤔
これ全部実装しても車輪の再発明なのでは🤔

## 便利機能
- [ ] chlensで開く

## 留意事項
omnibarはchlens側で無くす可能性あり #79
一応こっちも追従する予定

方針としては可能な限り共通化、保守コストを下げる
共通化・リファクタリングしながらすすめる
