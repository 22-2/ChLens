# Chlens Live Phase 1 workspace／window spike

## 目的

既存ChlensのbundleへLiveの責務を混ぜず、Mainと透明Overlayを別ウィンドウで起動できる最小の実行境界を作る。
この段階では掲示板取得・dat解析・Live Sessionはまだ実装しない。

## workspace

- `pnpm-workspace.yaml` に `apps/*` を追加した。
- `apps/chlens-live` をReact／Vite+ workspace packageとして追加した。
- `index.html` と `overlay.html` を別entryにし、build成果物は `apps/chlens-live/dist` に出力する。
- rootには次の独立scriptを追加した。
  - `pnpm build:live`
  - `pnpm dev:live`
  - `pnpm check:live`
  - `pnpm test:live`
  - `pnpm tauri:live`
  - `pnpm build:tauri-live`

既存rootの `build:chrome`、`build:firefox`、`build:tauri` は変更せず、Liveの出力先も分離している。

## window境界

`apps/chlens-live/src-tauri/tauri.conf.json` に次の2 windowを定義した。

| window | 役割 | 初期状態 |
| --- | --- | --- |
| `main` | 操作用の実況Main | 表示、1200 x 800 |
| `overlay` | 将来のコメント表示面 | 非表示、透明、decorationsなし、always-on-top、900 x 160 |

Main UIは `LiveWindowPlatform` だけを呼び出し、Tauri APIをReact componentへ直接importしない。

Viteの開発watcherは `src-tauri/**` を除外している。WindowsではRust build中のDLLがロックされるため、生成物をViteが監視すると `EBUSY` でdev起動に失敗する。

- Tauri adapter: `src/platform/tauri.ts`
- browser／test fallback: `src/platform/browser.ts`
- 共通契約: `src/platform/types.ts`

MainからOverlayの表示、非表示、focus、geometry適用を操作できる。
現在のgeometryは `localStorage` の `chlens-live:overlay-geometry` に保存し、Tauriではdisplay scalingを考慮したlogical pixelとして復元する。

## Phase 1で意図的に含めないもの

- Edge URL入力、subject／dat取得、レス解析
- Live Session、polling、差分取得、再接続
- コメントlane、速度、opacity、click-through
- Chlensとの相互起動bridge

これらはPhase 2以降でplatform境界とdomain APIを確定してから追加する。

## 自動検証

- `pnpm --filter chlens-live check`: format、lint、type check成功
- `pnpm --filter chlens-live test`: 1 file／2 tests成功
- `pnpm --filter chlens-live build`: Main／Overlayの2 HTML entryを出力
- `pnpm --filter chlens-live tauri:build`: Windows向けMSI／NSIS bundle生成成功
- `pnpm exec vp test run`: 97 test files／501 tests成功
- `pnpm tsc6`: 成功
- `pnpm build:chrome`、`pnpm build:firefox`、`pnpm build:tauri`: 既存3 targetの再ビルド成功

透明Overlayを実際に表示して操作する確認（Mainの表示／非表示／focus、geometry保存）は、Windows上での手動確認として残す。
