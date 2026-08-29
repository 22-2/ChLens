
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
- [ ] タブ名先頭にスレの状態アイコン（もちろんchlensと同じ）
- [ ] レスがプレーンテキストのまま表示されるので画像やパーサ導入
- [ ] ホイールで更新（スレ一覧では上、スレでは下、インディケーターもその挙動もそのまま移植）
- [ ] ホイールでタブスイッチ
- [ ] ホイールクリックでタブを閉じる
- [ ] スレでの自動更新の挙動（chlensと同じで一番下のラインに入らないと更新しないように）
- [ ] レスの右クリックメニュー（レスコピーなど）
- [ ] 板が実況板としか表示されない（本来のタイトルを取得する仕組みを）

### 中～大移植
- [ ] 自動次スレ検索
- [ ] NG機能全般（一覧での強調、スレでのNG、DSL）
- [ ] 設定画面
- [ ] コマンドパレット
- [ ] ジェスチャー
- [ ] 書き込み
- [ ] ステータスバー

## 便利機能
- [ ] chlensで開く

## 留意事項
omnibarはchlens側で無くす可能性あり #79
一応こっちも追従する予定

方針としては可能な限り共通化、保守コストを下げる
共通化・リファクタリングしながらすすめる
