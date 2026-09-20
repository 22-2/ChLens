export type ToastKind = "default" | "success" | "error" | "info";

export interface ToastRecord {
  id: number;
  message: string;
  kind: ToastKind;
  backgroundColor?: string;
}

export interface ToastNotifyOptions {
  html?: boolean;
  backgroundColor?: string;
  targetWindow?: Window;
}

export interface ToastTargetOptions {
  targetWindow?: Window;
}

type ToastListener = () => void;
type ToastTarget = Window | null;

const MAX_TOASTS = 5;
const EMPTY_RECORDS: readonly ToastRecord[] = [];
let nextToastId = 0;
// 変更理由: 別窓のページが発火したToastをメイン窓へ混ぜると、
// 利用者が操作している表示場所と通知の位置がずれるため、Window単位で状態を分ける。
const recordsByTarget = new Map<ToastTarget, readonly ToastRecord[]>();
const listenersByTarget = new Map<ToastTarget, Set<ToastListener>>();

function resolveTarget(targetWindow?: Window): ToastTarget {
  return targetWindow ?? (typeof window === "undefined" ? null : window);
}

function emit(target: ToastTarget): void {
  for (const listener of listenersByTarget.get(target) ?? []) {
    listener();
  }
}

function pushToast(
  message: string,
  kind: ToastKind,
  backgroundColor: string | undefined,
  targetWindow: Window | undefined,
): void {
  const target = resolveTarget(targetWindow);
  const record: ToastRecord = {
    id: nextToastId++,
    message,
    kind,
    backgroundColor,
  };
  recordsByTarget.set(target, [...(recordsByTarget.get(target) ?? []), record].slice(-MAX_TOASTS));
  emit(target);
}

export const toastStore = {
  getSnapshot: (targetWindow?: Window): readonly ToastRecord[] =>
    recordsByTarget.get(resolveTarget(targetWindow)) ?? EMPTY_RECORDS,
  subscribe(listener: ToastListener, targetWindow?: Window): () => void {
    const target = resolveTarget(targetWindow);
    const listeners = listenersByTarget.get(target) ?? new Set<ToastListener>();
    listeners.add(listener);
    listenersByTarget.set(target, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        listenersByTarget.delete(target);
      }
    };
  },
  dismiss(id: number, targetWindow?: Window): void {
    const target = resolveTarget(targetWindow);
    const records = recordsByTarget.get(target) ?? [];
    const nextRecords = records.filter((record) => record.id !== id);
    if (nextRecords.length === records.length) {
      return;
    }
    if (nextRecords.length === 0) {
      recordsByTarget.delete(target);
    } else {
      recordsByTarget.set(target, nextRecords);
    }
    emit(target);
  },
  notify(message: string, options?: ToastNotifyOptions) {
    pushToast(message, "default", options?.backgroundColor, options?.targetWindow);
  },
  success(message: string, options?: ToastTargetOptions) {
    pushToast(message, "success", undefined, options?.targetWindow);
  },
  error(message: string, options?: ToastTargetOptions) {
    pushToast(message, "error", undefined, options?.targetWindow);
  },
  info(message: string, options?: ToastTargetOptions) {
    pushToast(message, "info", undefined, options?.targetWindow);
  },
};
