/**
 * Chrome側のログ取得ブリッジと、MCPサーバーの間で共有する通信契約。
 *
 * 変更理由: MCPのJSON-RPCとブラウザ内部の取得処理を直接結び付けると、
 * Chrome側へNode専用コードが混ざり、拡張機能のビルドと実行環境が壊れるため。
 */

export const MCP_BRIDGE_PORT = 17890;
export const MCP_BRIDGE_HOST = "127.0.0.1";
export const MCP_BRIDGE_BASE_URL = `http://${MCP_BRIDGE_HOST}:${MCP_BRIDGE_PORT}`;
export const MCP_BRIDGE_WS_URL = `ws://${MCP_BRIDGE_HOST}:${MCP_BRIDGE_PORT}/v1/ws`;
export const MCP_BRIDGE_ALARM_NAME = "chlens-mcp-bridge";

export type ThreadReadMode = "auto" | "cache" | "refresh";

export interface ThreadReadParams {
  /** 省略時はChLensで現在表示中のスレッドを対象にする。 */
  url?: string;
  /** autoはキャッシュを利用し、必要なら通常の取得処理を行う。 */
  mode?: ThreadReadMode;
  /** 指定時はレス番号の範囲で絞り込む。 */
  start?: number;
  end?: number;
  /** 先頭から取得するレス数。 */
  first?: number;
  /** 末尾から取得するレス数。 */
  last?: number;
  /** 被返信数の多いレスを取得する件数。 */
  popular?: number;
}

export interface LogSearchParams {
  /** スレタイ・本文・URLを検索する。空文字なら最近のログを返す。 */
  query?: string;
  /** 返すログの最大件数。 */
  limit?: number;
}

export type BridgeOperation = "read-thread" | "search-logs";

export interface BridgeRequest {
  requestId: string;
  operation: BridgeOperation;
  params: ThreadReadParams | LogSearchParams;
}

export interface BridgeSuccess<T> {
  requestId: string;
  ok: true;
  result: T;
}

export interface BridgeFailure {
  requestId: string;
  ok: false;
  error: string;
}

export type BridgeResponse<T = unknown> = BridgeSuccess<T> | BridgeFailure;

export interface BridgePollResponse {
  request: BridgeRequest | null;
}

export interface BridgeThreadResult {
  kind: "thread";
  title: string;
  url: string;
  totalResponses: number;
  selectedResponses: number;
  source: "cache" | "auto" | "refresh";
  toon: string;
}

export interface BridgeLogResult {
  kind: "logs";
  query: string;
  count: number;
  toon: string;
}
