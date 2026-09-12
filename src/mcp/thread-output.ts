import { encode } from "@toon-format/toon";
import { buildReplyIndexes } from "src/core/reply-index";
import type { ThreadReadParams } from "src/mcp/protocol";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";
import { stripHtml } from "src/view/browser/utils/response-format";

const MAX_SELECTED_RESPONSES = 500;
const MAX_RELATION_NUMBERS = 50;

interface OutputResponse {
  num: number;
  date: string;
  id: string;
  message: string;
  replyCount: number;
  anchorCount: number;
  replyTo: string;
  repliedBy: string;
  ng: boolean;
}

interface SelectionResult {
  responses: IRes[];
  mode: "all" | "range" | "first" | "last" | "popular";
  truncated: boolean;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function relationText(numbers: Set<number> | undefined): string {
  if (!numbers || numbers.size === 0) return "";
  const values = [...numbers].sort((a, b) => a - b);
  const visible = values.slice(0, MAX_RELATION_NUMBERS).join(",");
  return values.length > MAX_RELATION_NUMBERS ? `${visible},…` : visible;
}

export function selectThreadResponses(
  responses: readonly IRes[],
  params: ThreadReadParams,
): SelectionResult {
  const all = [...responses];
  const rangeStart = positiveInteger(params.start);
  const rangeEnd = positiveInteger(params.end);
  const first = positiveInteger(params.first);
  const last = positiveInteger(params.last);
  const popular = positiveInteger(params.popular);

  // 変更理由: 複数の絞り込み指定を組み合わせると結果の意味が曖昧になるため、
  // 範囲・人気・先頭・末尾の順で最も具体的な指定だけを採用する。
  if (rangeStart != null || rangeEnd != null) {
    const start = rangeStart ?? 1;
    const end = rangeEnd ?? Number.MAX_SAFE_INTEGER;
    const selected = all.filter((response) => response.num >= start && response.num <= end);
    return {
      responses: selected.slice(0, MAX_SELECTED_RESPONSES),
      mode: "range",
      truncated: selected.length > MAX_SELECTED_RESPONSES,
    };
  }

  if (popular != null) {
    const indexes = buildReplyIndexes(all);
    const ranked = [...all]
      .sort((a, b) => {
        const replyDifference =
          (indexes.repIndex.get(b.num)?.size ?? 0) - (indexes.repIndex.get(a.num)?.size ?? 0);
        return replyDifference || a.num - b.num;
      })
      .slice(0, Math.min(popular, MAX_SELECTED_RESPONSES))
      .sort((a, b) => a.num - b.num);
    return {
      responses: ranked,
      mode: "popular",
      truncated: all.length > ranked.length && popular > MAX_SELECTED_RESPONSES,
    };
  }

  if (first != null) {
    const selected = all.slice(0, Math.min(first, MAX_SELECTED_RESPONSES));
    return {
      responses: selected,
      mode: "first",
      truncated: all.length > selected.length,
    };
  }

  if (last != null) {
    const selected = all.slice(-Math.min(last, MAX_SELECTED_RESPONSES));
    return {
      responses: selected,
      mode: "last",
      truncated: all.length > selected.length,
    };
  }

  const selected = all.slice(0, MAX_SELECTED_RESPONSES);
  return {
    responses: selected,
    mode: "all",
    truncated: all.length > selected.length,
  };
}

export function encodeThreadForMcp(
  thread: Pick<IThreadDetail, "title" | "url" | "res" | "expired" | "message">,
  params: ThreadReadParams,
  source: "cache" | "auto" | "refresh",
): { toon: string; selectedResponses: number; totalResponses: number } {
  const indexes = buildReplyIndexes(thread.res);
  const selection = selectThreadResponses(thread.res, params);
  const responses: OutputResponse[] = selection.responses.map((response) => ({
    num: response.num,
    date: response.date || response.other || "",
    id: response.id ?? "",
    message: stripHtml(response.message),
    replyCount: indexes.repIndex.get(response.num)?.size ?? 0,
    anchorCount: indexes.ancIndex.get(response.num)?.size ?? 0,
    replyTo: relationText(indexes.ancIndex.get(response.num)),
    repliedBy: relationText(indexes.repIndex.get(response.num)),
    ng: response.ng != null,
  }));

  const data = {
    thread: {
      title: thread.title ?? "",
      url: thread.url,
      totalResponses: thread.res.length,
      selectedResponses: responses.length,
      selection: selection.mode,
      truncated: selection.truncated,
      source,
      expired: thread.expired === true,
      message: thread.message ?? "",
    },
    responses,
  };

  return {
    toon: encode(data),
    selectedResponses: responses.length,
    totalResponses: thread.res.length,
  };
}

export function encodeLogsForMcp(
  query: string,
  logs: readonly {
    threadUrl: string;
    title: string;
    boardTitle: string;
    resLength: number | null;
    lastUpdated: number;
  }[],
): string {
  return encode({
    logs: logs.map((log) => ({
      url: log.threadUrl,
      title: log.title,
      board: log.boardTitle,
      responses: log.resLength ?? 0,
      lastUpdated: new Date(log.lastUpdated).toISOString(),
    })),
    query,
    count: logs.length,
  });
}
