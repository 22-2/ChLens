import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { isTauriRuntime } from "src/app/platform/runtime";

export const ARCHIVE_REPLAY_WINDOW_LABEL = "archive-replay";
export const ARCHIVE_REPLAY_SEEK_EVENT_NAME = "chlens://archive-replay-seek";
export const ARCHIVE_REPLAY_MAIN_WINDOW_LABEL = "main";
export const ARCHIVE_REPLAY_MAIN_THREAD_EVENT_NAME = "chlens://archive-replay-main-thread";

export interface ArchiveReplaySeekRequest {
  threadUrl: string;
  responseNumber: number;
}

export interface ArchiveReplayMainThreadRequest {
  version: 1;
  sessionId: string;
  generation: number;
  threadUrl: string;
  responseNumber: number;
  title: string;
  /** 同期補正を差し引いたログ上の時刻。古い通知との互換性のため省略可能。 */
  playbackAt?: number;
}

async function getArchiveReplayWindow(): Promise<Window> {
  const replayWindow = await Window.getByLabel(ARCHIVE_REPLAY_WINDOW_LABEL);
  if (!replayWindow) {
    throw new Error(`Tauri window '${ARCHIVE_REPLAY_WINDOW_LABEL}' is not available`);
  }
  return replayWindow;
}

/**
 * 過去実況の操作窓を表示する。
 * 変更理由: 再生状態をMainのReactツリーへ持ち込むとペイン切替で窓が破棄されるため、
 * Tauriの固定label窓へ状態とライフサイクルを閉じ込める。
 */
export async function openArchiveReplayWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("過去実況再生窓はTauri版でのみ利用できます");
  }
  const replayWindow = await getArchiveReplayWindow();
  await replayWindow.unminimize();
  await replayWindow.show();
  await replayWindow.setFocus();
}

export async function hideArchiveReplayWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await (await getArchiveReplayWindow()).hide();
}

/** OSの閉じる操作も破棄ではなく非表示へ揃え、次回のコマンドで同じ窓を再利用する。 */
export async function subscribeArchiveReplayWindowClose(onClose: () => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  return getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    onClose();
  });
}

/** ThreadViewのレス位置を、再生窓のロード済みタイムラインへ通知する。 */
export async function requestArchiveReplaySeek(request: ArchiveReplaySeekRequest): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("過去実況再生窓はTauri版でのみ利用できます");
  }
  if (!isArchiveReplaySeekRequest(request)) {
    throw new TypeError("過去実況のシーク要求が不正です");
  }

  // 右クリック直後でも窓が背後に隠れないよう、通知前に表示とフォーカスを確定する。
  await openArchiveReplayWindow();
  await emitTo(ARCHIVE_REPLAY_WINDOW_LABEL, ARCHIVE_REPLAY_SEEK_EVENT_NAME, request);
}

/** 再生窓の現在スレを、Mainの専用ThreadViewへ通知する。 */
export async function requestArchiveReplayMainThread(
  request: ArchiveReplayMainThreadRequest,
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("過去実況のMain同期はTauri版でのみ利用できます");
  }
  if (!isArchiveReplayMainThreadRequest(request)) {
    throw new TypeError("過去実況のMain同期要求が不正です");
  }
  await emitTo(ARCHIVE_REPLAY_MAIN_WINDOW_LABEL, ARCHIVE_REPLAY_MAIN_THREAD_EVENT_NAME, request);
}

export async function subscribeArchiveReplaySeekRequests(
  listener: (request: ArchiveReplaySeekRequest) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};

  return listen<unknown>(ARCHIVE_REPLAY_SEEK_EVENT_NAME, ({ payload }) => {
    if (!isArchiveReplaySeekRequest(payload)) {
      console.error("[ArchiveReplay] 不正なシーク要求を受信しました:", payload);
      return;
    }
    listener(payload);
  });
}

/** Main側で再生窓からの現在スレ通知を購読する。 */
export async function subscribeArchiveReplayMainThreadRequests(
  listener: (request: ArchiveReplayMainThreadRequest) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};

  return listen<unknown>(ARCHIVE_REPLAY_MAIN_THREAD_EVENT_NAME, ({ payload }) => {
    if (!isArchiveReplayMainThreadRequest(payload)) {
      console.error("[ArchiveReplay] 不正なMain同期要求を受信しました:", payload);
      return;
    }
    listener(payload);
  });
}

export function isArchiveReplaySeekRequest(payload: unknown): payload is ArchiveReplaySeekRequest {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as { threadUrl?: unknown; responseNumber?: unknown };
  return (
    typeof candidate.threadUrl === "string" &&
    candidate.threadUrl.trim().length > 0 &&
    typeof candidate.responseNumber === "number" &&
    Number.isInteger(candidate.responseNumber) &&
    candidate.responseNumber > 0
  );
}

export function isArchiveReplayMainThreadRequest(
  payload: unknown,
): payload is ArchiveReplayMainThreadRequest {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as {
    version?: unknown;
    sessionId?: unknown;
    generation?: unknown;
    threadUrl?: unknown;
    responseNumber?: unknown;
    title?: unknown;
    playbackAt?: unknown;
  };
  return (
    candidate.version === 1 &&
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.trim().length > 0 &&
    typeof candidate.generation === "number" &&
    Number.isInteger(candidate.generation) &&
    candidate.generation >= 0 &&
    typeof candidate.threadUrl === "string" &&
    candidate.threadUrl.trim().length > 0 &&
    typeof candidate.responseNumber === "number" &&
    Number.isInteger(candidate.responseNumber) &&
    candidate.responseNumber > 0 &&
    typeof candidate.title === "string" &&
    candidate.title.trim().length > 0 &&
    (candidate.playbackAt === undefined ||
      (typeof candidate.playbackAt === "number" && Number.isFinite(candidate.playbackAt)))
  );
}
