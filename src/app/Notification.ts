const DEFAULT_ICON_PATH = "../img/read.crx_128x128.png";

type NotificationApi = typeof globalThis.Notification;
type NotificationPermissionState = "default" | "denied" | "granted";

interface AppPlatformWindowManager {
  openUrlInTab?: (url: string, active?: boolean) => Promise<void> | void;
}

interface AppGlobal {
  platform?: {
    window?: AppPlatformWindowManager;
  };
}

function getNotificationApi(targetWindow?: Window): NotificationApi | null {
  const surfaceWindow = targetWindow ?? (typeof window === "undefined" ? null : window);
  // 別窓のWindow型にはNotificationが含まれない環境があるため、
  // 実行時のグローバルオブジェクトとして扱って対象窓のAPIを取得する。
  const surfaceGlobal = surfaceWindow as (Window & typeof globalThis) | null;
  if (!surfaceGlobal || typeof surfaceGlobal.Notification === "undefined") {
    return null;
  }
  return surfaceGlobal.Notification;
}

async function requestPermission(api: NotificationApi): Promise<NotificationPermissionState> {
  if (api.permission === "granted" || api.permission === "denied") {
    return api.permission;
  }
  return api.requestPermission();
}

function openUrl(url: string, targetWindow?: Window): void {
  const surfaceWindow = targetWindow ?? window;
  const appObj = (surfaceWindow as Window & { app?: AppGlobal }).app;
  const windowManager = appObj?.platform?.window;

  // Notification clickでの遷移先は環境依存があるため、
  // まずplatform抽象化を使い、なければwindow.openへフォールバックする。
  if (windowManager?.openUrlInTab) {
    void windowManager.openUrlInTab(url, true);
    return;
  }

  surfaceWindow.open(url, "_blank", "noopener,noreferrer");
}

export default class Notification {
  public readonly title: string;
  public readonly message: string;
  public readonly url: string;
  public readonly tag?: string;
  public readonly ready: Promise<boolean>;
  private readonly targetWindow: Window | undefined;
  private notify: globalThis.Notification | null = null;

  static isSupported(targetWindow?: Window): boolean {
    return getNotificationApi(targetWindow) !== null;
  }

  constructor(title: string, message: string, url = "", tag?: string, targetWindow?: Window) {
    this.title = title;
    this.message = message;
    this.url = url;
    this.tag = tag;
    this.targetWindow = targetWindow;
    this.ready = this.show();
  }

  private async show(): Promise<boolean> {
    const notificationApi = getNotificationApi(this.targetWindow);
    if (!notificationApi) {
      return false;
    }

    const permission = await requestPermission(notificationApi);
    if (permission !== "granted") {
      return false;
    }

    this.notify = new notificationApi(this.title, {
      tag: this.tag,
      body: this.message,
      icon: DEFAULT_ICON_PATH,
    });

    if (this.url !== "") {
      this.notify.addEventListener("click", () => {
        (this.targetWindow ?? window).focus();
        openUrl(this.url, this.targetWindow);
        this.notify?.close();
      });
    }

    return true;
  }
}
