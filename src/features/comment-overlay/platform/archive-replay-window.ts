import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { isTauriRuntime } from "src/app/platform/runtime";

export const ARCHIVE_REPLAY_WINDOW_LABEL = "archive-replay";
export const ARCHIVE_REPLAY_SEEK_EVENT_NAME = "chlens://archive-replay-seek";

export interface ArchiveReplaySeekRequest {
  threadUrl: string;
  responseNumber: number;
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
