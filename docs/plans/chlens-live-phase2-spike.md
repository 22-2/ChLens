# Chlens Live Phase 2 domain／取得 spike

## 目的

Phase 2の本実装へ進む前に、既存の`@chlen/ch-lib`をChlens Liveから1本通し、
URL正規化・HTTP transport・文字コードdecode・subject／dat parserの責務境界を固定する。
このspikeではLive UIやLive Sessionのpollingを実装せず、後続の取得実装がplatform APIへ直接依存しないことを確認する。

## 既存資産

`packages/ch-lib`にはすでに次の処理がある。Phase 2ではこれらをLive側へ複製せず、workspace packageとして利用する。

- `ChURL`: 5ch互換、Eddibb、まちBBS、したらばのURL正規化とsubject／dat URL生成
- `BoardParser`: subject.txtのスレ一覧parse
- `ThreadParser`: datのレスparse
- `ChFetcher`: board／thread取得のcomposition

## spikeで固定する境界

```text
ChLens Live source
        │
        ▼
     ChFetcher ── HttpClient ── FetchHttpClient／Tauri adapter／fixture
        │
        ├─ ChURLによるURL正規化
        ├─ HttpResponseのstatus／headers／bytes
        ├─ charset decode (Shift_JIS／EUC-JP)
        └─ BoardParser／ThreadParser
```

- `HttpClient`はURL・request metadata・raw bytesを扱うtransport portとする。
- `ChFetcher`は`HttpClient`をconstructor injectionで受け、HTTP実装を直接importしない。
- `ChLensLiveSource`はLive Sessionのcomposition boundaryとして`loadBoard`／`loadThread`だけを公開する。
- LiveのVite／TypeScript設定はworkspace packageをsourceへ解決し、package build成果物に依存せずspikeを検証できるようにする。

## 実装済みの最小slice

- `packages/ch-lib/src/fetcher/HttpClient.ts`に`HttpClient`、`HttpResponse`、`FetchHttpClient`、HTTP status errorを追加した。
- `ChFetcher`へtransport injectionを追加した。
- `apps/chlens-live/src/live-session/source.ts`から`@chlen/ch-lib`を利用するadapterを追加した。
- `apps/chlens-live/src/live-session/tauri-http-client.ts`にTauri HTTP pluginからraw bytesを返すadapterを追加した。
- Live Tauri shellへ`tauri-plugin-http`を登録し、HTTP capabilityを追加した。
- Eddibb board URLのsubject取得、Shift_JIS decode、thread URLのdat取得先、HTTP 404をfixtureで確認した。
- Live sourceがparser／transportをUIへ漏らさず委譲する契約テストを追加した。
- Tauri adapterのstatus／headers／raw bytes変換とtransport error再送出をテストした。
- `BBSMenuParser`が`<br>`を次カテゴリの開始と誤認していた問題を修正し、ch-lib全体テスト19/19件を成功させた。

## 意図的に含めないもの

- ThreadList／ThreadのReact UI
- Live Sessionのpolling、差分取得、再接続
- ETag／Last-Modifiedを使ったcache policy
- Tauri HTTP pluginの本実装
- NG／filter／history

## 完了条件

- `@chlen/ch-lib`のURLとparserをLiveから利用できる。
- browser fetch、fixture、将来のTauri HTTPを同じ`HttpClient`契約へ差し替えられる。
- Shift_JIS／EUC-JPのdecodeとHTTP status errorがparser入力前に確定する。
- Live UIが`ChURL`、`fetch`、`TextDecoder`、parserを直接importしない。
- ch-lib単体とLive adapterの自動テストが成功する。

## 次のPhase 2本実装

spike完了後に、incremental response metadata、LiveThreadSession、
subject／dat cacheの順で追加する。取得結果をMainとOverlayへ共有するevent contractは、
Live Sessionの所有者を決めてから設計する。

## 検証コマンド

```bash
pnpm --filter @chlen/ch-lib exec vp check
pnpm --filter @chlen/ch-lib test
pnpm --filter chlens-live check
pnpm --filter chlens-live test
pnpm --filter chlens-live build
```
