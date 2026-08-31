# Browser UI / CSS の Radix UI 統一・分割計画

## 目的

`src/view/browser` の UI 基盤を、次の構成へ段階的に統一する。

- 複雑な操作とアクセシビリティ: **Radix Primitives**
- 見た目: **plain CSS + CSS Custom Properties（デザイントークン）**
- アイコン: 既存の **Lucide React** を継続
- 表、仮想スクロール、状態管理など: TanStack / Zustand など既存の非 UI 基盤を継続

最終的には Mantine、Tailwind CSS、SCSS を browser view から除去し、巨大な
`src/view/browser.scss` を UI コンポーネント・画面単位の CSS に分割する。

> 本計画でいう「Radix UI へ統一」は、Radix Themes で外観まで置き換えることではなく、
> unstyled な Radix Primitives をアクセシビリティと振る舞いの基盤にし、外観を本プロジェクトの
> トークンと CSS で管理することを指す。単純な `div`、`button`、`input` まで無理に Radix 化はしない。

---

## 現状の棚卸し

2026-08-20 時点のソースを対象とした。

| 項目             | 現状                                                         | 問題                                                                                 |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| メインスタイル   | `styles/index.css` と責務別のplain CSS                       | `browser.scss` / `bundle.scss` を削除し、component / page / foundation単位へ分割済み |
| その他の自前CSS  | `src/view/browser/styles/` 配下の32 CSS                      | 読み込み順は `styles/index.css` に集約。Radix wrapper導入前のBEM classは維持         |
| Mantine          | 本番コード15ファイル、テストを含め21ファイルから参照         | Provider、Spotlight、フォーム、レイアウト、Tooltipなど用途が混在                     |
| Tailwind CSS     | 依存・PostCSS・設定ファイルが存在                            | `content` が廃止済みの `src/view/thread` を指し、実質的な utility 利用は見当たらない |
| SCSS             | browser viewのソース・Vite専用ビルド経路ともに削除           | 他画面を含むSCSS参照はなく、`sass`依存とSCSS用型宣言も削除済み                       |
| デザイントークン | `--ref-*` / `--sys-*` 契約。`--browser-*` 参照は0件          | foundation以外のraw colorを減らし、dark themeをsemantic token中心へ移行中            |
| 生成CSS          | `debug/chrome/browser.css` 約337KB                           | browser viewの自前CSSは1本に統合。旧 `view/browser.css` の二重生成は廃止             |
| DOM依存          | BEM classを `querySelector` / `closest` / テストから多数参照 | CSS Modulesへの一括変更は振る舞いまで壊すリスクが高い                                |

### Mantine の主な利用箇所

| 領域                                 | 現在の用途                                 | 移行先                                                              |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| `App.tsx`                            | `MantineProvider` / theme                  | Providerを削除し、`data-theme` + token CSSへ一本化                  |
| `CommandPalette.tsx`                 | Spotlight、Modal、TextInput、Button        | Radix Dialog + 既存の検索・履歴ロジック + 自前 Command List         |
| `command-palette-store.ts`           | `createSpotlight`                          | 小さな Zustand store または既存のローカルstoreへ置換                |
| `SettingsPage.tsx`                   | レイアウト、フォーム、ScrollArea、表示部品 | native form + Radix Checkbox / RadioGroup / ScrollArea + 共通UI部品 |
| `SettingsSupplementaryPanels.tsx`    | Modal、Checkbox、Skeleton等                | Radix Dialog / Checkbox + 共通UI部品                                |
| 板一覧 / ホーム                      | Accordion、Alert、Button、Text等           | Radix Accordion + 共通UI部品 / semantic HTML                        |
| Thread / Search / MediaViewer        | Loader                                     | 自前 `Spinner`                                                      |
| ThreadMinimap / VirtualizedDataTable | Floating Tooltip                           | Radix Tooltip                                                       |

### 先に解消すべき構造上の問題

1. `index.tsx` は自前の `styles/index.css` だけを取り込む。Mantine CSSは削除済み。
2. browser view専用の `scssPlugin`、`bundle.scss`、`browser.scss` は削除済みで、HTMLから参照されるCSSは `browser.css` 1本になった。
3. foundationのtoken層は分離済みだが、Mantineのtheme / style APIが残る画面ではライブラリ由来の値が混在している。
4. `.mantine-*` と `--mantine-*` への上書きがあり、UIライブラリの変更がスタイルへ漏れている。
5. 見た目用クラスが一部の振る舞いとテストのセレクタも兼ねており、命名変更の影響範囲が広い。

### 変更履歴から見た現在の進捗

直近のコミットでは、計画のPhase 1〜2-3、Thread / Settings系のCSS分割、browser viewのSCSS経路削除までが実装されている。

| コミット                                                                  | 実施内容                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `86670bb9 refactor: phase 1`                                              | foundationのreset / theme / tokenを追加し、dark themeの大部分を分離               |
| `52d7a41c refactor: phase 2-1`                                            | BrowserShell、PaneLayout、ContentAreaをCSSへ分割                                  |
| `d6e375c6 refactor: phase 2-2`                                            | ContextMenu、StatusBar、TabBarをCSSへ分割                                         |
| `4162fb8b refactor: 2-3`                                                  | NavigationBar、Home、BoardList、PageStatusをCSSへ分割                             |
| `2e051dcb refactor: デザイントークンをより厳密に`                         | `--ref-*` / `--sys-*`契約、token lint、overlay順を整備                            |
| `d0cfa18c refactor(ui): overlay z-indexを意味tokenへ統一`                 | 固定z-indexを意味tokenへ統一し、popup / tooltip / dialog順を固定                  |
| `ee1412e6 refactor(ui): DataTableスタイルをコンポーネントCSSへ分割`       | DataTable / thread-list / tooltipをコンポーネントCSSへ分割し、表用tokenを追加     |
| `a29d5141 refactor(ui): ThreadPageスタイルをページCSSへ分割`              | ThreadPageのoverlay、minimap、auto-scroll、toolbarをページCSSへ分割               |
| `53bd5a3b refactor(ui): SearchBarスタイルをコンポーネントCSSへ分割`       | Ctrl+F検索バーをsystem tokenで統一し、コンポーネントCSSへ分割                     |
| `761ccb43 refactor(ui): ThreadResponseメタデータをページCSSへ分割`        | レスの本文、ID、返信、所有者バッジをThreadResponse CSSへ分割                      |
| `711184b3 refactor(ui): Thread popupスタイルをコンポーネントCSSへ分割`    | ResPopup、返信ツリー、アンカープレビューをpopup tokenへ移行                       |
| `30244c72 refactor(ui): MediaViewerスタイルをコンポーネントCSSへ分割`     | 画像viewerのscrim、操作バー、stageを専用tokenへ移行                               |
| `58ca97f3 refactor(ui): ThreadResponseのメディアスタイルをtoken化`        | リンクカード、サムネイル、動画埋め込み、highlightをThreadResponseへ集約           |
| `4036e746 refactor(ui): StatusBarの操作スタイルをコンポーネントCSSへ統合` | StatusBarの操作系セレクタを専用CSSへ移動                                          |
| `4a9d16a4 refactor(ui): MiniWindowスタイルをコンポーネントCSSへ分割`      | mini windowのヘッダー、フォーム、状態表示を専用CSSへ移動                          |
| `8349b966 refactor(ui): BottomPanelとWritePanelをコンポーネントCSSへ分割` | 書き込み・下部パネルを専用CSSへ移動                                               |
| `71e53125 refactor(ui): NG Editorスタイルを設定ページCSSへ分割`           | NG Editorのフォーム・detailsを設定CSSへ移動                                       |
| `4f0bcf9e refactor(ui): ThreadListページスタイルをページCSSへ分割`        | スレ一覧のページ固有スタイルを専用CSSへ移動                                       |
| `19d8d4a8 refactor(ui): 設定ダイアログをページCSSへ分割`                  | Bookmark / supplementary dialogのスタイルを設定CSSへ移動                          |
| `b1b469a0 refactor(ui): SettingsPageのshellをページCSSへ分割`             | Settingsのshell、sidebar、cardをページCSSへ移動                                   |
| `1f8e662d refactor(ui): 残りの設定フォームとコマンドパレットをCSSへ分割`  | SettingsForm、CommandPalette、Toastをsemantic tokenで専用CSSへ移動                |
| `7d294fe8 refactor(build): SCSSの互換ビルド経路を削除`                    | bundle / browser SCSS、ViteのscssPlugin、sass依存、legacy token aliasを削除       |
| `48f4817d refactor(ui): Loaderを共通Spinnerへ置換`                        | Home / Thread / Search / MediaViewer / SettingsのLoaderを共通Spinnerへ置換        |
| `2eca7bbc refactor(ui): Radix Tooltip wrapperへ移行`                      | ThreadMinimap、VirtualizedDataTableをRadix Tooltipへ移行しtooltip surfaceを共通化 |
| `153bc68f refactor(ui): HomeとBoardListの表示部品を共通UIへ移行`          | Home / BoardListのAlert、Button、Loaderを共通UIへ移行                             |
| `bd544165 refactor(ui): BoardListのAccordionをRadix wrapperへ移行`        | MenuAccordionをRadix Accordion wrapperとsemantic HTMLへ移行                       |
| `ecd60893 refactor(ui): Command PaletteをRadix Dialogへ移行`              | Mantine Spotlightを廃止し、Command Paletteを共通Dialogと外部storeへ移行           |
| `e2cf6471 refactor(settings): Mantine useMediaQueryを共通hookへ置換`      | Settingsのレスポンシブ判定をwindow.matchMedia購読へ移行                           |
| `44557749 refactor(ui): Settings補助パネルを共通UIへ移行`                 | supplementary panelのCard / Modal / Checkboxをsemantic HTMLとRadix Dialogへ移行   |
| `512ece7e refactor(settings): 設定入力を共通Radix controlへ移行`          | Checkbox / RadioをRadixへ、number / textareaをsemantic form controlへ移行         |
| `4724ad1f refactor(settings): SettingsPageのMantineレイアウトを削除`      | Settingsのshell、カテゴリ、カード、NGヘルプをsemantic HTMLへ移行                  |
| `b30d1def refactor(ui): MantineProviderとグローバルCSSを削除`             | MantineProviderとcore stylesheetを削除し、data-themeとtoken CSSへ一本化           |
| `54a8554a test(ui): Mantine Tooltipモックを削除`                          | Tooltip wrapper移行後のテストから旧Mantineモックを削除                            |
| `61583c0c refactor(build): MantineとTailwindの未使用依存を削除`           | Mantine / Tailwind / PostCSS依存と関連設定ファイルを削除                          |
| `8dafeef2 refactor(build): 未使用UIユーティリティ依存を削除`              | 直接参照のないclass-variance-authority / clsxを削除                               |
| `96180b12 fix(settings): タブ間のカード幅とボタン配色を統一`              | supplementary panelをSettingsカード内へ配置し、幅とaccent buttonを統一            |
| `8f037e5b refactor(settings): Surface構造を共通UIへ統一`                  | SettingsのsurfaceをHeader / Body / Actions / Stack契約へ統一                      |
| `48998888 refactor(ui): Sonner通知をRadix Toastへ移行`                    | 外部store経由の共通Toast wrapperへ移行し、通知APIを維持したままSonnerを削除       |
| `31f05e60 refactor(ui): 自前ContextMenuをRadix wrapperへ移行`             | 座標・z-index・nested popup契約を維持したRadix ContextMenu wrapperへ移行          |
| `f7c729b5 fix(ui): Radix ContextMenuの座標二重適用を修正`                 | Radixのviewport座標を尊重し、ContextMenuのleft/top再適用とoverflow補正を削除      |
| `16e9c782 refactor(ui): popup DOMの共通wrapperを導入`                     | AnchorPreview / ResPopupのlifecycle・座標・z-indexをFloatingPopupへ集約           |
| `d40e6ecb refactor(ui): ReplyTreePopupとMiniWindowを共通overlayへ移行`    | ReplyTreePopupをFloatingPopupへ、MiniWindowをRadix Popoverへ移行                  |

この状態でbrowser viewの自前スタイルは、foundation / layout / component / pageのplain CSSへ分割され、Mantine / Tailwind / PostCSSの依存は削除された。
ToastとContextMenuをRadix wrapperへ移行し、popup共通wrapper化まで完了した。
次はpopup managerの責務分離へ進む。

### 現在の分割済み範囲

- `styles/foundation/`: reset、base、reference / semantic token、light / dark theme
- `styles/layout/`: BrowserShell、PaneLayout、ContentArea
- `styles/components/`: ContextMenu、CommandPalette、DataTable、MediaViewer、MiniWindow、NavigationBar、SearchBar、StatusBar、TabBar、ThreadPopup、Toast、WheelScrollIndicator、BottomPanel、WritePanel
- `styles/ui/`: Spinner、Tooltip、Button、Alert、Accordion、Dialog、FormControls、Surface
- `ui/`: Spinner、Tooltip、Button、Alert、Accordion、Dialog、FormControls、Surface、Toast、ContextMenu、FloatingPopup、Popover（Radix / semantic wrapper）
- `styles/pages/`: Home、BoardList、PageStatus、ThreadList、ThreadPage、ThreadResponse、SettingsPage、SettingsForm、BookmarkDialog、NGEditor
- `browser.scss` / `bundle.scss`: 削除済み。browser viewの自前CSS入口は `styles/index.css` のみ
- `pnpm lint:tokens`、`pnpm tsc6`、対象コンポーネントテスト、Chrome/Firefox/Tauriビルドを各区切りで確認済み

---

## 採用方針

### 1. Radix Primitives を採用する

Radix Primitives は unstyled で、DialogやAccordionなどのフォーカス管理・キーボード操作・
ARIAを提供する。状態は `data-state` などで公開されるため、自前CSSと組み合わせやすい。

原則として `radix-ui` の統合パッケージから named import する。導入時に production build の
tree-shaking結果を確認し、未使用コードが残る場合だけ個別の `@radix-ui/react-*` packageへ切り替える。

- 公式: <https://www.radix-ui.com/primitives/docs/components>
- スタイリング: <https://www.radix-ui.com/primitives/docs/guides/styling>
- アクセシビリティ: <https://www.radix-ui.com/primitives/docs/overview/accessibility>

### 2. スタイル方式は plain CSS に統一する

- Tailwind utility class、Mantine style props、SCSS構文を新規追加しない。
- コンポーネントのDOMには既存のBEM classを当面維持する。
- Radixの状態は `.component[data-state="open"]` のようにスタイルする。
- 値の共通化にはCSS Custom Propertiesを使用する。
- `@layer` でカスケード順を固定し、import順への暗黙依存を減らす。
- CSS Modulesは初期移行では採用しない。既存クラスを振る舞い・テストが参照しているためである。

### 3. ソースは分割し、成果物は当面1本を維持する

拡張機能では全画面が単一のbrowser view内で切り替わるため、最初の移行では
`browser.css` を複数リクエストに分けない。ソースCSSはコンポーネントごとに分け、
Viteには従来どおり最終的な `browser.css` 1本へbundleさせる。

これにより、次を同時に満たす。

- 保守時は責務ごとの小さなCSSを編集できる。
- Chrome / Firefox extension と Tauri の読み込み方式を変えずに済む。
- CSSの順序を `styles/index.css` で明示できる。
- 将来ページをdynamic importする場合に限り、ページCSSのcode splittingを別途検討できる。

### 4. Radixに存在しない見た目部品は薄い共通UIとして持つ

Radixは総合コンポーネントライブラリではないため、次は `src/view/browser/ui` に小さな部品を持つ。

- `Button`
- `IconButton`
- `TextField` / `TextArea` / `NumberField`
- `Spinner`
- `Alert`
- `Badge`
- `Surface`
- `Stack`（必要ならCSS layout utilityではなくReact部品として最小限にする）

これらは業務ロジックを持たず、variantは `data-variant` / `data-size` とトークンで表現する。
`class-variance-authority` や `tailwind-merge` は使わず、不要なら削除する。

---

## 目標ディレクトリ構成

```text
src/view/browser/
├── index.tsx
├── styles/
│   ├── index.css                 # 読み込み順とcascade layerの入口
│   ├── foundation/
│   │   ├── reset.css
│   │   ├── tokens.css            # --ref-* と theme非依存の --sys-* scale
│   │   ├── themes.css            # light/darkはtoken値だけを上書き
│   │   ├── base.css
│   │   └── utilities.css         # visually-hidden等、ごく少数
│   └── layout/
│       ├── BrowserShell.css
│       ├── PaneLayout.css
│       └── ContentArea.css
├── ui/
│   ├── Button.tsx
│   ├── Button.css
│   ├── Dialog.tsx
│   ├── Dialog.css
│   ├── Tooltip.tsx
│   ├── Tooltip.css
│   ├── Accordion.tsx
│   ├── Accordion.css
│   ├── FormControls.tsx
│   ├── FormControls.css
│   ├── Spinner.tsx
│   └── Spinner.css
├── components/
│   ├── TabBar.tsx
│   ├── TabBar.css
│   ├── StatusBar.tsx
│   ├── StatusBar.css
│   └── ...
└── pages/
    ├── HomePage.tsx
    ├── HomePage.css
    ├── ThreadPage.tsx
    ├── ThreadPage.css
    ├── thread/
    │   └── ThreadResponse.css
    └── settings/
        ├── SettingsPage.css
        └── SettingsForm.css
```

原則はTSXの所有者の隣へCSSを置く。ただし複数コンポーネントが一体であるレス表示、
テーブル、ポップアップ群は、無理に1ファイルずつへ細分化せずfeature CSSとしてまとめる。

---

## デザイントークン設計

### トークンを3層に分ける

```css
/* reference: 値そのもの。tokens.css以外から直接使わない */
--ref-color-blue-600: #1a73e8;
--ref-space-2: 4px;
--ref-radius-sm: 2px;

/* system: テーマに応じた意味。component/page CSSが利用する */
--sys-color-surface: var(--ref-color-neutral-0);
--sys-color-surface-muted: var(--ref-color-neutral-100);
--sys-color-text: var(--ref-color-neutral-950);
--sys-color-text-muted: var(--ref-color-neutral-600);
--sys-color-border: var(--ref-color-neutral-300);
--sys-color-accent: var(--ref-color-blue-600);
--sys-color-error: var(--ref-color-red-600);

/* component: owner CSSの中だけで使う意味付きの補助token */
--cmp-tab-height: var(--sys-space-13);
```

### ルール

- `--ref-*` は値の辞書、`--sys-*` は意味の辞書として扱い、consumerは`--sys-*`だけを使う。
- `--cmp-*` はownerのCSS内で定義し、foundationへcomponent固有値を追加しない。
- raw color、raw shadow、raw z-indexは `tokens.css` に限定する。画像・データ可視化は例外として理由を残す。
- overlayは `minimap < table-tooltip < popup-layer < context-menu < tooltip < toast < dialog < gesture` の順に重ね、親のstacking contextも同じ規約に従わせる。
- dark themeは `[data-theme="dark"]` 内で`--ref-*`を直接上書きせず、`--sys-*`を別のreferenceへ束ねる。
- hover、focus、selected、disabled、success、warning、dangerを共通語彙にする。
- spacing、radius、shadow、font size、line height、motion、z-indexもtoken化する。
- `--browser-*` のlegacy aliasは追加しない。consumerは`--sys-*`を直接参照する。
- tokenを追加する前に、既存tokenで表現できない意味か確認する。同じ値だからという理由でsemantic tokenを増やさない。
- 参照token名に画面・コンポーネント名を含めない。`--ref-color-*`と`--sys-color-*`の責務を保つ。
- `prefers-reduced-motion` と `forced-colors` の扱いをfoundationで定義する。

### 完了時の制約

- `themes.css` にコンポーネントセレクタを置かない。
- `ui/` と新規コンポーネントCSSにraw color、raw shadow、raw z-indexを追加しない。
- sourceに`var(--browser-*)`を追加しない。
- `--ref-*`をconsumer CSSから直接参照しない（alphaやshadowも`--sys-*`へ意味付けしてから使う）。
- `--mantine-*`、`.mantine-*` を参照しない。
- z-indexは用途別tokenに限定し、場当たり的な数値追加を禁止する。

この契約は `pnpm lint:tokens`（`scripts/check-browser-design-tokens.mjs`）で、抽出済みCSSに対して
機械的に検査する。browser viewの自前CSSはすべて検査対象とし、legacy aliasの再導入を防ぐ。

---

## `browser.scss` の分割マップ（実績）

機械的な切り出しを先に行い、見た目の変更は後続PRへ分離する。

| 現在の領域                                        | 移動先の例                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| reset、`html`、`body`                             | `styles/foundation/reset.css` / `base.css`                                          |
| `.browser-shell` とtoken宣言                      | `tokens.css`、`themes.css`、`layout/BrowserShell.css`                               |
| `.pane-*`、`.content-area*`                       | `layout/PaneLayout.css`、`layout/ContentArea.css`                                   |
| `.tab-*`、`.status-bar*`、`.nav-bar*`             | 各componentの隣のCSS                                                                |
| `.context-menu*`                                  | `styles/components/ContextMenu.css` が所有し、wrapperは `ui/ContextMenu.tsx` に集約 |
| `.home-page*`、`.board-*`                         | 各page / feature CSS                                                                |
| `.settings-*`、`.ng-editor*`                      | `pages/settings`配下の複数CSS                                                       |
| `.simple-data-table*`、`.cursor-tooltip*`         | `styles/components/DataTable.css`                                                   |
| `.thread-page*`、`.res*`                          | ThreadPage CSSとThreadResponse feature CSS                                          |
| `.res-popup*`、`.anchor-preview*`、`.reply-tree*` | popup featureごとのCSS                                                              |
| `.media-viewer*`                                  | `MediaViewer.css`                                                                   |
| `.bottom-panel*`、`.write-panel*`                 | 各component CSS                                                                     |
| dark themeの個別上書き                            | semantic tokenへ移し、残った例外だけ所有元CSSへ移動                                 |
| Sonner上書き                                      | `styles/components/Toast.css` のRadix Toastへ移行済み                               |

既存class名はこの段階で変えない。切り出し後に、振る舞いがclass名へ依存する箇所を
`data-ui="content-area"`、`data-popup`、refなどへ徐々に変更し、見た目とDOM探索を分離する。

---

## Radix / 共通UIへの置換マップ

| 現在                               | 置換                                              | 注意点                                                                 |
| ---------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `MantineProvider`                  | 削除                                              | themeは既存 `useTheme()` が付与する `data-theme` のみにする            |
| Mantine `Modal` / 自前dialog       | Radix `Dialog` / `AlertDialog`                    | Portal先、nested popup、focus restore、Escape、Tauri drag regionを確認 |
| Mantine `Tooltip.Floating`         | Radix `Tooltip`                                   | `Tooltip.Provider`をapp rootに1つ置き、遅延時間をtoken化               |
| Mantine `Accordion`                | Radix `Accordion`                                 | `multiple`、開閉状態、右クリック処理、`data-state` animationを維持     |
| Mantine `Checkbox`                 | Radix `Checkbox` + Label                          | hidden input相当の値連携と設定保存をテスト                             |
| Mantine `Radio`                    | Radix `RadioGroup`                                | JSON Schema由来の値変換をUI外へ保つ                                    |
| Mantine `ScrollArea`               | 原則native scroll、必要箇所のみRadix `ScrollArea` | 仮想テーブルには安易に適用しない                                       |
| Mantine `Button`等                 | 共通 `Button` / semantic HTML                     | variantとloading表示を共通化                                           |
| Mantine `Loader` / `Skeleton`      | 共通 `Spinner` / `Skeleton`                       | `aria-busy`、reduced motion対応                                        |
| Mantine `Alert` / `Badge` / `Card` | 共通 `Alert` / `Badge` / `Surface`                | 表示だけの部品にRadixを使わない                                        |
| Mantine Spotlight                  | Radix `Dialog` + 自前Command List                 | 既存fuzzy search、履歴、shortcut、非同期実行を維持                     |
| 自前 `ContextMenu`                 | Radix `ContextMenu`                               | nested popup、danger item、disabled、座標・z-indexを回帰確認           |
| 自前 mini window / popup           | Radix `Popover` または `HoverCard`                | 自動スクロール停止条件とpointer境界を維持                              |
| Sonner                             | Radix `Toast` wrapper                             | `container.toast` APIを維持してUI実装だけ交換する                      |

Command PaletteはRadixに同等の完成部品がない。別のUIライブラリを追加せず、既存の
`filterAndSortBrowserCommands`、履歴、実行処理を残し、Dialog内のlistbox/keyboard navigationだけを
小さな専用コンポーネントとして実装する。

---

## 実施フェーズ

### Phase 0: 回帰基準を固定する

目的は、後続PRで「意図した構造変更」と「見た目・操作の事故」を区別できるようにすること。

- Chromeのlight/darkについて主要画面のPlaywright screenshotを追加する。
- Home、板一覧、スレ一覧、スレ本文、設定、2ペイン、Command Palette、各dialogを対象にする。
- keyboard smoke testを追加する。
  - Tab / Shift+Tab
  - Enter / Space
  - Escape
  - Arrow key
  - dialog close後のfocus復帰
- 現在のproduction CSSサイズ、JSサイズ、起動時間を記録する。
- Chrome / Firefox / Tauriで最低限の手動確認表を作る。

**終了条件:** 主要な見た目と操作を自動または明文化された手順で比較できる。

### Phase 1: token基盤を独立させる

- `tokens.css`、`themes.css`、`reset.css`、`base.css`を追加する。
- `.browser-shell` 内のtokenをfoundationへ移す。
- 利用側を新semantic tokenへ移し、legacy `--browser-*` aliasを削除する。✅
- dark themeの個別上書きを棚卸しし、色・shadow・borderをsemantic tokenへ集約する。
- token命名と利用ルールを同docsまたはCSS冒頭に残す。

**終了条件:** light/dark切替が主にtoken値の変更で成立し、既存表示との差分がない。

### Phase 2: `browser.scss` をplain CSSへ機械分割する

- 上記分割マップに従い、1領域ずつCSSへ移す。
- SCSSネストは展開し、セレクタや詳細度をこの段階では変更しない。
- `styles/index.css` でcascade layerと読み込み順を明示する。
- browser viewの自前スタイルは `index.tsx` から `styles/index.css` だけを読み込む。
- `WheelScrollIndicator.css` も所有コンポーネントの隣へ揃える。
- build結果を確認したうえで `bundle.scss`、`browser.scss`、独自 `scssPlugin` を削除する。✅
- 他用途がないことを確認して `sass` を削除する。✅
- 未参照の `view/browser.css` が生成されないようにする。✅

**終了条件:** browser viewの自前SCSSが0件、最終成果物は意図した `browser.css` 1本だけになる。✅

### Phase 3: 共通UI層とRadix基盤を導入する

- `radix-ui` を追加する。✅
- `ui/Spinner`、`Tooltip`、`Button`、`Alert`、`Accordion`、`Dialog` wrapperを追加する。✅
- `ui/FormControls`を追加し、Radix Checkbox / RadioGroupとsemantic inputを共通化する。✅
- Settingsのsurfaceは共通 `ui/Surface` のsemantic cardで統一する。✅
- `ui/Toast`をRadix wrapperと外部storeへ移行する。✅
- `ui/ContextMenu`はRadixを直接散在させずwrapper化する。✅
- wrapperはprops/refをDOMまでforwardし、Radixの `asChild` 合成を壊さないようにする。
- Portal containerとz-indexの規約を定義する。
- UI部品のinteraction testを追加する。

**終了条件:** feature側がMantine/Radixの細かなAPIではなく、プロジェクトの共通UI APIを利用できる。

### Phase 4: 低リスク部品からMantineを外す

次の順序を推奨する。

1. `Loader` → `Spinner`（SearchBar、ThreadPage、MediaViewer、Home、Settings）。✅
2. `Tooltip.Floating` → `Tooltip`（ThreadMinimap、VirtualizedDataTable）。✅
3. Home / BoardListのAlert、Button。✅
4. BoardListのAccordion。✅
5. `useMediaQuery` → `window.matchMedia` を扱う小さなhook。✅

**終了条件:** 小さな表示部品と板一覧がMantineへ依存しない。

### Phase 5: Settingsを移行する

SettingsはMantine利用密度が最も高かったため、保存ロジックを維持したまま段階的に置換した。

1. layout (`Stack` / `Group` / `Box` / `Paper`) をsemantic HTML + page CSSへ移す。✅
2. 表示部品 (`Text` / `Title` / `Badge` / `Alert` / `Card`) を共通UIへ移す。✅
3. input (`NumberInput` / `Textarea`) を共通form controlsへ移す。✅
4. `Checkbox` / `Radio` をRadixへ移す。✅
5. supplementary panelのModalをDialogへ移す。✅
6. `ScrollArea`をnative scrollへ移す。✅

設定値の読み書き、auto-save、data import/exportはUI変更と同じPRで書き換えず、既存ロジックを維持する。

**終了条件:** Settingsと補助panelがMantineへ依存せず、全設定項目の保存・復元テストが通る。

### Phase 6: OverlayとCommand Paletteを移行する

- 自前ContextMenuをRadixへ移す。✅
- Bookmark root / Thread NG / response jump / import-export dialogを共通Dialogへ揃える。import-exportは✅。
- AnchorPreview / ResPopupを共通 `ui/FloatingPopup` へ移行する。✅
- MiniWindowをRadix Popoverへ移行し、ReplyTreePopupをFloatingPopupへ統一する。✅
- Command PaletteをRadix Dialog + 自前Command Listへ移す。✅
- Spotlight storeを小さな外部storeへ置換する。✅
- SonnerをRadix Toast wrapperへ置換し、`container.toast` の呼び出し側は変更しない。✅

**終了条件:** overlayのPortal、focus、Escape、z-index、nested interactionが統一され、MantineとSonnerを参照しない。

### Phase 7: 依存と設定を削除する

- `@mantine/core` ✅
- `@mantine/dates` ✅
- `@mantine/form` ✅
- `@mantine/hooks` ✅
- `@mantine/spotlight` ✅
- `postcss-preset-mantine` ✅
- `tailwindcss` ✅
- `@tailwindcss/postcss` ✅
- `tailwind-merge` ✅
- `class-variance-authority` ✅
- `clsx` ✅
- `sass` ✅
- `sonner` ✅

併せて `tailwind.config.js`、`postcss.config.js`、古いshadcn向け `components.json` を削除し、
`pnpm-lock.yaml` を更新した。✅

**終了条件:** `rg '@mantine|mantine-|tailwind|\.scss' src package.json` が0件で、
全platform buildに不要なCSSが含まれない。

### Phase 8: class依存を整理し、運用ルールを固定する

- DOM探索に必要な印はclassではなく `data-ui` / `data-role` / refへ移す。
- テストは可能な限りrole、label、test idを使い、見た目classへの依存を減らす。
- lintまたは小さなcheck scriptで次を検知する。
  - source内の `.scss`
  - `@mantine/*` / Tailwind import
  - foundation以外への無許可raw color追加
  - `--mantine-*` / `.mantine-*`
- 新UI追加時のチェックリストをdocsへ追加する。

**終了条件:** 古いスタイル方式が自然に再流入しない。

---

## PRの推奨分割

| PR  | 内容                                      | 原則                             |
| --- | ----------------------------------------- | -------------------------------- |
| 1   | visual baselineとbundle計測               | production挙動を変更しない       |
| 2   | foundation / token基盤                    | 見た目を変更しない               |
| 3   | `browser.scss` のCSS分割                  | セレクタ・詳細度を変更しない。✅ |
| 4   | build経路整理とSCSS除去                   | output pathを維持する。✅        |
| 5   | 共通UI + Radix導入、Spinner / Tooltip移行 | 小さな部品で設計を検証する       |
| 6   | Home / BoardList / Accordion移行          | 画面単位で完結させる             |
| 7   | Settings前半（layout / display）          | formの値処理を変更しない         |
| 8   | Settings後半（form / dialog）             | 保存・復元を重点テストする       |
| 9   | ContextMenu / popup / dialog移行          | nested overlayを重点テストする   |
| 10  | Command Palette / Toast移行               | shortcutとfocusを重点テストする  |
| 11  | Mantine / Tailwind / Sonner等の削除       | lockfileとbundle差分を確認する   |
| 12  | class依存・lintルール整理                 | 見た目の変更を混ぜない           |

各PRは「機械的移動」「UIライブラリ置換」「デザイン変更」を混ぜない。デザイン自体を改善する場合は、
Radix移行完了後に別PRで行う。

---

## 検証方針

### 各PRで実行するもの

```bash
pnpm lint
pnpm tsc6
pnpm test
pnpm run build:chrome
pnpm run build:firefox
pnpm run build:tauri
```

Vite+移行ルールに合わせ、節目では `vp check` と `vp test` も実行する。
CSSのみのPRでも最低限Chrome buildと主要screenshot比較を行う。

### 重点確認項目

- light / dark / OS theme追従
- 100% / 125% / 150% zoom
- keyboard-only操作とfocus-visible
- Dialogを閉じた後のfocus復帰
- nested popup / context menu / tooltipの前後関係
- 2ペイン時のPortal表示先とactive pane
- virtualized tableのscroll性能
- thread popup表示中の自動スクロール停止
- Tauriのwindow drag region
- reduced motion
- Firefox固有のscrollbar / overflow
- extension CSP下でinline styleや動的styleに依存していないこと

### 数値で追うもの

- production `browser.css` bytes（現状Chrome約330KB）
- production `browser.js` bytes
- 同内容CSSの重複生成数（最終目標1）
- raw color件数（現状約546）
- Mantine / Tailwind / SCSS import件数（最終目標0）
- visual regression差分

CSSサイズは「必ず何KB以下」と先に決めず、PRごとの増減理由を記録する。Radix導入直後に一時的に増えても、
Mantine削除後の最終値で評価する。

---

## 主なリスクと対策

| リスク                                                    | 対策                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| CSS分割でcascade順が変わる                                | `@layer` と中央entryで順序を固定し、最初は詳細度を変更しない                           |
| Radix Portalがpane外へ出てtheme/tokenを継承しない         | `data-theme` をapp rootとPortal containerで共有し、Portal規約を共通wrapperに閉じ込める |
| Dialog導入で既存shortcutやEscape処理と競合する            | keyboard interaction testを移行前に追加し、overlayごとに優先順位を定義する             |
| class名変更でDOM探索が壊れる                              | 初期移行ではBEM class維持、後から `data-ui` / refへ置換する                            |
| Settings一括置換で保存形式まで壊れる                      | layout、表示、form、dialogを別PRにする                                                 |
| Radix化の名目でwrapperが巨大化する                        | wrapperは見た目と共通挙動だけを持ち、feature stateは所有元に残す                       |
| bundleが増える                                            | 統合packageのtree-shakingを実測し、必要な場合だけ個別packageへ変更する                 |
| native scrollとRadix ScrollAreaの入れ替えで仮想化が壊れる | 仮想テーブルはnative scrollを既定とし、見た目だけを理由に置換しない                    |

---

## 完了条件

- browser viewのinteractive primitiveがRadix wrapper経由へ統一されている。
- 単純な表示・form部品が共通UIまたはsemantic HTMLへ統一されている。
- Mantine、Tailwind CSS、PostCSS、SCSS、Sonnerへの依存が削除されている。
- `browser.scss` が存在せず、各コンポーネント / feature / page単位のplain CSSになっている。✅
- dark themeは原則としてsemantic tokenの差し替えだけで成立する。
- productionで参照される自前CSS成果物が `browser.css` 1本だけである。
- Chrome / Firefox / Tauri build、unit test、主要visual / keyboard testが通る。
- 現在の主要操作と表示を維持し、意図しないvisual regressionがない。
- 新しいUI・色・spacingをどこへ追加するか、迷わないディレクトリとルールが残っている。

---

## 次に着手する範囲

foundation、token、CSS分割、SCSSビルド経路、Mantine / Tailwind依存の整理は完了した。
Toastの共通化、Sonner削除、ContextMenuのRadix wrapper化、popup共通wrapper化まで完了した。

1. `ui/Spinner`、`Tooltip`、`Button`、`Alert`、`Accordion`、`Dialog`、`FormControls`、`Surface`で低リスク部品を置換済み。✅
2. Settingsのレイアウト、入力、補助panelを共通UIへ移し、カード幅とボタン配色を統一済み。✅
3. `ui/Toast` と外部storeを導入し、`container.toast`の呼び出し側を維持する。✅
4. Sonnerを削除し、依存・lockfile・bundle差分を確認する。✅
5. 自前ContextMenuをRadix ContextMenu wrapperへ移行し、nested popup・focus・z-indexを回帰確認する。✅
6. AnchorPreview / ResPopupを `ui/FloatingPopup` へ移行し、共通lifecycleを回帰確認する。✅
7. ReplyTreePopupのpopup共通wrapper化と、MiniWindowのRadix Popover化を進める。✅
8. popup managerをstore・graph・dismiss・hover・feature factoryへ分離する。

各段階でChrome / Firefox / Tauri buildと対象interaction testを実行し、最後にvisual baselineを追加する。
