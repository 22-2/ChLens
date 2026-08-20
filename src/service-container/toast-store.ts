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
}

type ToastListener = () => void;

const MAX_TOASTS = 5;
let nextToastId = 0;
let records: readonly ToastRecord[] = [];
const listeners = new Set<ToastListener>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function pushToast(message: string, kind: ToastKind, backgroundColor?: string) {
  const record: ToastRecord = {
    id: nextToastId++,
    message,
    kind,
    backgroundColor,
  };
  records = [...records, record].slice(-MAX_TOASTS);
  emit();
}

export const toastStore = {
  getSnapshot: () => records,
  subscribe(listener: ToastListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  dismiss(id: number) {
    const nextRecords = records.filter((record) => record.id !== id);
    if (nextRecords.length === records.length) {
      return;
    }
    records = nextRecords;
    emit();
  },
  notify(message: string, options?: ToastNotifyOptions) {
    pushToast(message, "default", options?.backgroundColor);
  },
  success(message: string) {
    pushToast(message, "success");
  },
  error(message: string) {
    pushToast(message, "error");
  },
  info(message: string) {
    pushToast(message, "info");
  },
};
