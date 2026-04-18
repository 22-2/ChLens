ThreadPageが900行を超え、状態管理とDOMイベントが入り乱れてまさに「沼」になりかけている状態っすね。提示いただいた「モダンなポップアップ管理のアプローチ」は非常に的確っす。

現状のコードから「コンポーネントの分離」「Hooksへのロジック抽出」「ポップアップの中央管理化」を実現するための、ステップバイステップのリファクタリング計画を提案するっす。

---

## 🛠️ リファクタリング計画

### Phase 1: 独立したロジックの Hooks 化（周辺機能の分離）
まずは、ポップアップ以外の「明らかに独立している巨大なロジック」を ThreadPage から追い出し、見通しを良くするっす。

1. **`useMouseGesture` の作成**
   - 巨大な `useEffect` になっている右クリックジェスチャー（キャンバス描画・スクロール）を分離。
   - `useMouseGesture({ scrollContainerRef })` のような形にする。
2. **`useMediaViewer` の作成**
   - 画像ビューアのロジック (`viewer`, `viewerScale`, `navigateViewer`, `openMediaFromUrl`) を分離。
3. **`useThreadData` の作成**
   - スレッドの取得 (`fetchThread`), 検索・フィルタリング (`filter`, `searchQuery`, `filteredResponses`), インデックス構築 (`indexes`, `idPositions`) の状態とロジックを分離。

### Phase 2: コンポーネントの物理的な分割
ThreadPage 内でベタ書きされている UI パーツを独立したファイルに切り出すっす。

1. **`<MediaViewer />`**
   - `viewer` 状態を受け取って描画する純粋なコンポーネントにする。
2. **`<ThreadToolbar />`**
   - フィルタボタンと検索バーの開閉UI部分を分離。
3. **`<ThreadError />` / `<ThreadLoading />`**
   - 状態に応じた表示部分を切り出し。

---

### Phase 3: 【本丸】ポップアップマネージャーの構築（状態の配列化とPortal化）
ここが提示いただいたテキストの核心部分っす。バラバラに管理されている `popup`, `treePopups`, `anchorPreviews`, `resContextMenu` を **1つの配列（スタック）** に統合するっす。

1. **単一のポップアップ状態の定義**
   - `PopupItem` 型を定義し、すべてのポップアップを同じインターフェースで管理する。
   ```typescript
   type PopupItem = {
     id: string;          // 一意のID (例: 'context-123', 'anchor-456')
     parentId?: string;   // どのポップアップから呼ばれたか (nullならルート)
     type: 'id' | 'tree' | 'anchor' | 'contextMenu';
     x: number;
     y: number;
     payload: any;        // 種類に応じたデータ (resNum, items, res など)
   }
   ```
2. **`usePopupManager` カスタムフックの作成**
   - `const [popups, setPopups] = useState<PopupItem[]>([])`
   - **開くロジック:** `addPopup(item)` 常に配列の末尾に追加。Z-index は `POPUP_BASE_Z + index` で自動算出。
   - **閉じるロジック:** `removePopup(id)` 指定したIDと、それを `parentId` に持つ子孫ポップアップを **一括で filter して削除** する。
3. **`ReactDOM.createPortal` によるDOMの脱出**
   - `<div id="popup-root"></div>` を HTML 側に用意（またはルートコンポーネントに配置）。
   - すべてのポップアップはこの Portal を通じてレンダリングし、DOMのネストの呪縛から解放する。

### Phase 4: グローバルイベント制御（沼の解消）
イベントのバブリング（伝播）に頼っていた開閉ロジックを、中央管理アプローチに書き換えるっす。

1. **Click Outside（外側クリックで閉じる）の単一化**
   - 各コンポーネントに `disableOutsideClick` などの複雑なフラグを持たせるのをやめるっす。
   - `usePopupManager` 内で `document` に対して1つだけ `click` イベントを仕掛ける。
   - クリックされた `e.target` が `[data-popup-id="xxx"]` を持っているか判定し、持っていなければ全閉じ。持っていれば、そのIDより上にあるポップアップ（子）だけを閉じる。
2. **Mouse Leave（ホバーで閉じる）の堅牢化**
   - アンカープレビューの遅延消去ロジック（`setTimeout`）をマネージャー側に寄せる。
   - `e.relatedTarget` をチェックし、移動先が「自分の子ポップアップ」であればタイマーをキャンセルする処理に統一する。

### Phase 5: コンテキストメニューのロジック分離
メニュー項目の構築ロジック (`buildContextMenuItems`) がコンポーネント内にあると、依存関係が多くて肥大化するっす。

1. **`useContextMenuActions` の作成**
   - 依存する関数 (`addIdToNg`, `handleAnchorClick`, `openMediaFromUrl` など) を引数または Context から受け取り、純粋に「メニュー設定の配列」を返すだけの Hook または Utility 関数にする。

---

## 🗓️ 進め方の提案

一気にやると確実に壊れてしまうので、以下の順序でPR（コミット）を分けることをお勧めするっす。

1. **Step 1:** ジェスチャー、ビューア、スレッドデータの **Hooks化**（状態は ThreadPage に残したまま、ロジックだけ抽出）
2. **Step 2:** メニューアクションのロジック分離と、細かな UI の **コンポーネント化**
3. **Step 3:** `usePopupManager` の作成と **Portal の基盤実装**（まだThreadPageには組み込まない）
4. **Step 4:** 現状の個別 Popup 状態を **マネージャーによるスタック管理に置き換え**。

この計画に沿って、まずは「Phase 1 の Hooks 化から具体的なコードを書きたい」や、「Phase 3 の PopupManager の詳細なインターフェースを設計したい」などあれば、次のステップのコードを作成するっす！どう進めるか指示をお願いするっす！
