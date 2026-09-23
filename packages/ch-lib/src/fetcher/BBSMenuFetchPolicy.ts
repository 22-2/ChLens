import { buildConditionalRequestHeaders } from "./ThreadFetchPolicy";

export interface BBSMenuFetchPolicyInput {
  hasCache: boolean;
  lastModified?: number | null;
  etag?: string | null;
}

/** bbsmenuの文字コードと再検証ヘッダーを掲示板仕様としてまとめる。 */
export function buildBBSMenuFetchPolicy({
  hasCache,
  lastModified,
  etag,
}: BBSMenuFetchPolicyInput): { charset: "Shift_JIS"; headers: Record<string, string> } {
  return {
    charset: "Shift_JIS",
    headers: buildConditionalRequestHeaders({ hasCache, lastModified, etag }),
  };
}
