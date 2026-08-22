# Popup manager リファクタリング計画

## 目的

[`src/view/browser/hooks/use-popup-manager.ts`](../../src/view/browser/hooks/use-popup-manager.ts) に集約されている popup 関連処理を、既存の表示・操作・close 規則を変えずに責務ごとへ分割する。

このファイルは約875行あり、現在は次の4種類の責務が同居している。

- scope付き Zustand store
- `parentId` を使った popup グラフ操作と cascade close
- popup DOM要素の mouse / outside-click lifecycle
- thread固有の popup生成、座標計算、anchor preview管理

リファクタリングの主目的は行数削減ではなく、純粋ロジックとDOM lifecycleを分離し、それぞれを独立してテストできる境界を作ることである。

## 現状の利用範囲

### 公開hook

| API | 主な利用箇所 | 役割 |
| --- | --- | --- |
| `usePopupCore` | `ThreadPage`、hookテスト | scope単位のpopup CRUD、close、子孫判定、pin |
| `usePopupCloseBehavior` | `FloatingPopup`、`ContextMenu` | hover、outside click、子popup遷移、close制御と抑止 |
| `useThreadPopupManager` | `ThreadPage` | thread用popupの抽出・生成、anchor preview |

### 現在固定されている主な挙動

- popupは `scopeId` ごとに分離され、scopeは参照カウントで破棄される。
- popup削除時は `parentId` をたどって子孫も削除する。
- context menuは mouseleave では閉じず、outside click / Radix dismissを主なclose契機にする。
- popup内リンク、右クリック、中クリックでは意図しない枝のcloseを抑止する。
- 子popupから親へ戻る場合、通常popupは子孫枝を閉じるが、context menuは維持する。
- 固定したtree popupは `closeNonContextPopups` の対象外になる。
- anchor previewはdepth、`sourcePopupId`、遅延タイマーによって親子関係を維持する。

## 設計方針

1. 初回移行では挙動変更を行わない。
2. 既存の公開import pathと挙動を維持しつつ、hook/type名は責務に合わせて整理する。
3. 純粋関数、store、DOM判定、React hookを別モジュールにする。
4. 条件式の簡略化やイベントモデル変更は、分割完了後の別変更にする。
5. 各段階で対象テストを実行し、失敗時に戻しやすい小さなコミットにする。

## 目標構成

```text
src/view/browser/hooks/
├─ use-popup-manager.ts                 # 既存import pathを維持するfacade / re-export
└─ popup-manager/
   ├─ popup-graph.ts                     # 純粋なparentIdグラフ操作
   ├─ popup-store.ts                     # scope付きZustand store
   ├─ popup-dom.ts                       # DOM属性・branch判定の補助関数
   ├─ use-popup-close-behavior.ts       # hover / outside click / close抑止
   └─ use-thread-popup-manager.ts        # thread固有の生成とanchor preview
```

必要に応じて `popup-manager/types.ts` を追加する。ただし、型を早期に分散させすぎず、まずは現在の `utils/types.ts` の popup型を再利用する。

## 実施フェーズ

### Phase 0: 振る舞いの棚卸しとテスト固定

既存テストを変更せず、分割前の契約を追加テストで明文化する。

追加候補は次のとおり。

- 同一scopeを複数mountした場合、最後のunmountまでstateが残る。
- `scopeId`変更時に旧scopeが解放され、新scopeへ切り替わる。
- 親・子・孫のcascade close、存在しないIDのno-op、壊れたparentIdや循環の終了保証。
- pinしたtree popupが一括close後も残る。
- anchor previewの重複抑止、depth単位の削除、遅延timerの再設定とcleanup。
- `sourcePopupId`の祖先anchorを、別anchor表示時に巻き込んで削除しない。
- outside click ignore ref、兄弟popup、子孫popupへの移動。
- 右クリックで`onPopupMouseDown`を呼ばない。
- リンク・中クリック後の最初のmouseleaveを抑止する。
- `closeDisabled`のtrue→false遷移時、実DOMの`:hover`を用いてclose判定する。

#### 仕様確認が必要な点

現在のpin処理は、pin時にtree popupをrootへ昇格させる。その後unpinしても元の`parentId`は復元されないため、これは仕様として固定するのか、将来復元可能にするのかを別途決める。初回分割では現状の動作を維持する。

### Phase 1: popup graphの純粋関数化

`popup-graph.ts`へ次を移す。

- `isPopupDescendantOf`
- predicateで指定されたpopupと子孫IDを収集する処理
- popup branchを削除する処理
- popup type / context menu判定のうちDOMに依存しないもの

推奨する内部APIの例：

```ts
collectPopupBranchIds(popups, rootIds)
isPopupDescendantOf(popups, popupId, ancestorId)
removePopupBranches(popups, predicate)
```

Map化、循環ガード、parent cascadeの意味は現状から変更しない。Reactをrenderせずにグラフ規則をテストできる状態を作る。

### Phase 2: scope付きpopup storeの分離

`popup-store.ts`へ次を移す。

- `PopupScopeState`
- scopeの生成、mount、unmount、参照カウント
- popup追加、ID削除、全削除、predicate削除
- tree pin切り替え
- `closeNonContextPopupsInScope`
- `closePopupChildrenInScope`
- scope内の子孫判定API

`usePopupStore`はstoreモジュール内に閉じ込め、`usePopupCore`にはscopeへbindする薄いadapterだけを残す。可能なら`createPopupStore()`もexportし、store単体テストでscope間分離とcascade closeを検証する。

### Phase 3: popup close behaviorの分離

`popup-dom.ts`へ、DOMとpopup属性に関する副作用のない処理を移す。

- `getPopupElementId`
- `isContextMenuPopupId`
- keep-open selector判定
- targetがpopup branch内かどうかの判定

`use-popup-close-behavior.ts`へ次を移す。

- `usePopupCloseBehavior`
- `mousedown` document listener
- hover state
- `closeDisabled`解除時の一回限り抑止
- right / middle click、リンク操作後のclose抑止timer

この段階では、イベント順序・capture/bubble・`:hover`判定・listenerの依存配列を整理しない。移動のみとし、既存の `FloatingPopup` / `ContextMenu` のprops契約を維持する。

### Phase 4: thread popup managerの分離

`use-thread-popup-manager.ts`へ次を移す。

- popup typeごとの `useMemo` 抽出
- `toPageCoords`
- anchor preview hide timer
- `showAnchorPreview`
- `hideAnchorPreview` / `hideAnchorPreviewImmediately`
- `addTreePopup`
- `addIdPopup`
- `addPopupContextMenu`
- `hasPopupChild`

`IRes`、`resMap`、anchor関連定数はこのfeature hookだけが参照するようにする。`rootRef`は現在API互換のため未使用だが、初回は削除せず維持する。

### Phase 5: facade化とimport整理

元の `use-popup-manager.ts` は次だけを担当する。

- 既存公開APIのre-export
- 既存公開型のre-export
- 必要な場合のcompatibility wrapper

`ThreadPage.tsx`、`FloatingPopup.tsx`、`ContextMenu.tsx`、`use-res-interaction-handlers.ts` のimport pathは、初回リファクタリングでは変更しない。

### Phase 6: テストの責務別整理

実装移動が安定した後で、既存の大きなテストを次へ分割する。

```text
popup-manager/
├─ popup-graph.test.ts
├─ popup-store.test.ts
├─ use-popup-close-behavior.test.tsx
└─ use-thread-popup-manager.test.tsx
```

テスト移動と実装移動を同じコミットに混ぜず、挙動差分の切り分けをしやすくする。

## 変更しない範囲

次の変更は、責務分割完了後の別タスクとする。

- Zustandから別の状態管理への変更
- `parentId`グラフ自体のデータ構造変更
- popup ID形式の変更
- mouse eventからpointer eventへの変更
- anchor depthの仕様変更
- pin解除時に元の親を復元する仕様変更
- 条件式の大幅な簡略化やstate machine化
- 座標系、z-index、Radix ContextMenuの挙動変更

## リスクと対策

| リスク | 対策 |
| --- | --- |
| 親削除時に子popupが残る | graph純粋関数のcascade testを先に追加する |
| context menuまでmouseleaveで閉じる | `closeOnMouseLeave` とoutside clickのテストを維持する |
| 子popupから親へ戻る時に親まで閉じる | `closeDisabled`解除、`:hover`、一回限り抑止の組み合わせを変更しない |
| 右クリックで選択範囲が消える | `button === 2` のcapture処理をそのまま移動する |
| anchor previewの親が消える | depth / `sourcePopupId` / ancestor除外を一体の契約としてテストする |
| scope間でpopupが混ざる | store単体で異なるscopeを同時に検証する |
| timerがunmount後にstate更新する | timer cleanupテストとeffect cleanupを維持する |
| facade化で循環importが発生する | store・DOM helper・feature hookからfacadeをimportしない |

## 検証方針

各フェーズのコミットごとに、少なくとも次を実行する。

```bash
pnpm exec vitest run src/view/browser/hooks/popup-manager/use-thread-popup-manager.test.tsx src/view/browser/hooks/popup-manager/use-popup-close-behavior.test.tsx
pnpm lint
pnpm tsc6
```

分割完了時にはプロジェクト標準の全体検証も行う。

```bash
vp check
vp test
pnpm run build:chrome
pnpm run build:firefox
pnpm run build:tauri
```

手動確認では、次を重点的に見る。

- 本文 → 返信tree → anchor → ID popupの順で開閉する。
- nested context menuを開き、子から親へ戻る。
- popup内リンクの左クリック、右クリック、中クリックを行う。
- 固定treeを本文操作後も残し、親popupを閉じる。
- scopeの異なるタブを切り替え、hidden tabのpopupが混ざらない。
- viewport端のanchor / context menuが正しい位置に出る。

## 推奨コミット単位

```text
test(popup): popup managerの境界ケースを固定
refactor(popup): popupグラフ操作を純粋関数へ分離
refactor(popup): scope付きpopup storeを分離
refactor(popup): popup close behaviorを分離
refactor(thread): thread popup managerを分離
test(popup): popup managerテストを責務別に整理
```

## 完了条件

- 既存の公開import pathと呼び出し側の挙動が維持されている。
- popup graph、store、close behavior、thread popup managerが別モジュールになっている。
- 親子cascade、context menu、pin、anchor preview、scope分離の既存挙動が回帰していない。
- 対象unit test、lint、型チェック、Chrome / Firefox / Tauri buildが通る。
- `use-popup-manager.ts`が複数責務の実装本体ではなく、import pathの互換性を保つfacadeになっている。
- 挙動変更（特にpin解除仕様）は、このリファクタリングとは別の変更として明示されている。
