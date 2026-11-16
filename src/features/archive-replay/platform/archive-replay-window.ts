import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { isTauriRuntime } from "src/app/platform/runtime";
import { defineTauriEventChannel } from "src/app/platform/tauri/typed-event";

/*
 * 過去実況窓の表示・非表示と、その状態をMainへ伝える通知を扱う。
 */

export const ARCHIVE_REPLAY_WINDOW_LABEL = "archive-replay";
const visibilityChannel = defineTauriEventChannel({
  name: "chlens://archive-replay-visibility",
  target: "main",
  logLabel: "ArchiveReplay",
  isPayload: (value: unknown): value is boolean => typeof value === "boolean",
});

/** 操作窓の表示状態はスレの追従設定とは独立してMainへ通知する。 */
export async function subscribeArchiveReplayVisibility(listener: (visible: boolean) => void) {
  if (!isTauriRuntime()) return () => {};
  return visibilityChannel.listen(listener);
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
  await visibilityChannel.emit(true);
}

export async function hideArchiveReplayWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await (await getArchiveReplayWindow()).hide();
  await visibilityChannel.emit(false);
}

/** OSの閉じる操作も破棄ではなく非表示へ揃え、次回のコマンドで同じ窓を再利用する。 */
export async function subscribeArchiveReplayWindowClose(onClose: () => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  return getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    onClose();
  });
}
