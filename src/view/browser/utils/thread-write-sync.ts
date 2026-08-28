import type { IRes } from "src/service-container/interfaces";
import { stripHtml } from "src/view/browser/utils/response-format";

const DEFAULT_WRITE_SUCCESS_DELAY_MS = 3000;

export const THREAD_WRITE_STARTED_EVENT = "thread_write_started";
export const THREAD_WRITE_COMPLETED_EVENT = "thread_write_completed";
const threadWriteSyncEventTarget = new EventTarget();

export interface WriteStartedPayload {
  threadUrl: string;
  submittedAt: number;
}

export function notifyThreadWriteStarted(payload: WriteStartedPayload): void {
  threadWriteSyncEventTarget.dispatchEvent(
    new CustomEvent<WriteStartedPayload>(THREAD_WRITE_STARTED_EVENT, {
      detail: payload,
    }),
  );
}

export function subscribeThreadWriteStarted(
  listener: (payload: WriteStartedPayload) => void,
): () => void {
  const handleEvent: EventListener = (event) => {
    if (!(event instanceof CustomEvent)) return;
    listener(event.detail as WriteStartedPayload);
  };
  threadWriteSyncEventTarget.addEventListener(THREAD_WRITE_STARTED_EVENT, handleEvent);
  return () => {
    threadWriteSyncEventTarget.removeEventListener(THREAD_WRITE_STARTED_EVENT, handleEvent);
  };
}

export interface PendingWritePayload {
  threadUrl: string;
  message: string;
  inputName: string;
  inputMail: string;
  submittedAt: number;
}

export function notifyThreadWriteCompleted(payload: PendingWritePayload): void {
  // 変更理由: app.message は内部で defer() を挟むため、投稿完了通知が RELOAD より後に届くと
  // baseline のレス数が新着反映後の値になり、自分レス照合が永久に走らないレースになる。
  // 同一ウィンドウ内の書き込みパネル→ThreadPage 連携だけは同期イベントで順序を固定する。
  threadWriteSyncEventTarget.dispatchEvent(
    new CustomEvent<PendingWritePayload>(THREAD_WRITE_COMPLETED_EVENT, {
      detail: payload,
    }),
  );
}

export function subscribeThreadWriteCompleted(
  listener: (payload: PendingWritePayload) => void,
): () => void {
  const handleEvent: EventListener = (event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    listener(event.detail as PendingWritePayload);
  };

  threadWriteSyncEventTarget.addEventListener(THREAD_WRITE_COMPLETED_EVENT, handleEvent);

  return () => {
    threadWriteSyncEventTarget.removeEventListener(THREAD_WRITE_COMPLETED_EVENT, handleEvent);
  };
}

export function normalizeWrittenMessage(message: string): string {
  return message.replace(/\s/g, "");
}

function parseLegacyThreadDate(rawValue: string): Date | null {
  const matched = rawValue.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.\))?\s?(\d{1,2}):(\d\d)(?::(\d\d)(?:\.\d+)?)?/,
  );
  if (!matched) {
    return null;
  }

  const [_fullMatch, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] =
    matched;

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, second);
}

export function resolveWriteSuccessDelayMs(rawValue: unknown): number {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return Math.max(0, Math.trunc(rawValue));
  }

  if (typeof rawValue === "string") {
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  // 変更理由: 旧UIの投稿完了フローは meta refresh の待ち時間が読めない場合でも 3 秒待つ前提で、
  // ここだけ 0ms に戻すと「最初の reload ではまだ自分のレスが見えない」回帰が再発する。
  return DEFAULT_WRITE_SUCCESS_DELAY_MS;
}

export function findLatestWrittenRes(
  responses: readonly IRes[],
  submittedMessage: string,
  ownResNums?: ReadonlySet<number>,
): IRes | null {
  const normalizedSubmittedMessage = normalizeWrittenMessage(submittedMessage);
  if (normalizedSubmittedMessage === "") {
    return null;
  }

  for (let index = responses.length - 1; index >= 0; index -= 1) {
    const response = responses[index];
    if (ownResNums?.has(response.num)) {
      continue;
    }

    if (normalizeWrittenMessage(stripHtml(response.message)) === normalizedSubmittedMessage) {
      return response;
    }
  }

  return null;
}

export function resolveWrittenResTimestamp(res: IRes): number {
  // 変更理由: ここで jsutil 全体を読むと browser-polyfill 依存まで巻き込んで
  // utility 単体テストが拡張環境必須になるため、旧書式の日付パースだけを局所実装する。
  const parsedDate = parseLegacyThreadDate(res.other ?? res.date ?? "");
  if (parsedDate instanceof Date && !Number.isNaN(parsedDate.valueOf())) {
    return parsedDate.valueOf();
  }

  return Date.now();
}
