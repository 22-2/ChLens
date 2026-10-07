export interface BBSMenuResponse {
  status: number;
  body: string;
  headers: Readonly<Record<string, string | undefined>>;
}

export interface ResolveBBSMenuResponseInput {
  /** 通信しなかった場合はundefined。 */
  response?: BBSMenuResponse;
  /** 保存済みのbbsmenu本文。キャッシュがなければnull。 */
  cachedBody: string | null;
}

/**
 * bbsmenuの取得結果から、解析する本文とキャッシュへの書き戻し方を決めた結果。
 * - `fresh`: 200で新しい本文を受け取った。本文と検証用ヘッダーを保存する
 * - `not-modified`: 304だった。保存済み本文を使い、確認日時だけ更新する
 * - `cached`: 通信しなかった、または失敗したため保存済み本文を使う
 */
export type BBSMenuResolution =
  | { kind: "fresh"; body: string; lastModified?: number; etag?: string }
  | { kind: "not-modified"; body: string }
  | { kind: "cached"; body: string };

/** Last-Modifiedヘッダーをタイムスタンプへ変換し、不正な値はundefinedにする。 */
export function parseLastModifiedHeader(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

/**
 * bbsmenuのレスポンスとキャッシュから、使う本文を決める。
 *
 * 変更理由: 200/304/通信失敗の判定はHTTPクライアントや保存先に依存しない掲示板仕様なので、
 * スレッド取得のThreadResponseResolverと同様にchlibへ置き、アプリ側はI/Oだけを担う。
 * 使える本文がない場合は、呼び出し元が利用者へ通知できるよう例外にする。
 */
export function resolveBBSMenuResponse({
  response,
  cachedBody,
}: ResolveBBSMenuResponseInput): BBSMenuResolution {
  if (response?.status === 200) {
    return {
      kind: "fresh",
      body: response.body,
      lastModified: parseLastModifiedHeader(response.headers["Last-Modified"]),
      etag: response.headers["ETag"],
    };
  }

  if (cachedBody != null) {
    if (response?.status === 304) return { kind: "not-modified", body: cachedBody };
    return { kind: "cached", body: cachedBody };
  }

  throw new Error(
    `板一覧の取得に失敗しました (status: ${response?.status ?? "通信なし"}, キャッシュなし)`,
  );
}
