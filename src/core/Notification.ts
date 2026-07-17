const DEFAULT_ICON_PATH = "../img/read.crx_128x128.png";

type NotificationApi = typeof window.Notification;
type NotificationPermissionState = "default" | "denied" | "granted";

interface AppPlatformWindowManager {
  openTab?: (url: string, active?: boolean) => Promise<void> | void;
}

interface AppGlobal {
  platform?: {
    window?: AppPlatformWindowManager;
  };
}

function getNotificationApi(): NotificationApi | null {
  if (
    typeof window === "undefined" ||
    typeof window.Notification === "undefined"
  ) {
    return null;
  }
  return window.Notification;
}

async function requestPermission(
  api: NotificationApi,
): Promise<NotificationPermissionState> {
  if (api.permission === "granted" || api.permission === "denied") {
    return api.permission;
  }
  return api.requestPermission();
}

function openUrl(url: string): void {
  const appObj = (window as Window & { app?: AppGlobal }).app;
  const windowManager = appObj?.platform?.window;

  // Notification clickでの遷移先は環境依存があるため、
  // まずplatform抽象化を使い、なければwindow.openへフォールバックする。
  if (windowManager?.openTab) {
    void windowManager.openTab(url, true);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export default class Notification {
  public readonly title: string;
  public readonly message: string;
  public readonly url: string;
  public readonly tag?: string;
  public readonly ready: Promise<boolean>;
  private notify: globalThis.Notification | null = null;

  static isSupported(): boolean {
    return getNotificationApi() !== null;
  }

  constructor(title: string, message: string, url = "", tag?: string) {
    this.title = title;
    this.message = message;
    this.url = url;
    this.tag = tag;
    this.ready = this.show();
  }

  private async show(): Promise<boolean> {
    const notificationApi = getNotificationApi();
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
        window.focus();
        openUrl(this.url);
        this.notify?.close();
      });
    }

    return true;
  }
}
