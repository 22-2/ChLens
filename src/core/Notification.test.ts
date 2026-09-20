import Notification from "src/core/Notification";
import { describe, expect, it, vi } from "vite-plus/test";

class FakeNotification extends EventTarget {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async (): Promise<NotificationPermission> => "granted");

  static instances: FakeNotification[] = [];
  readonly title: string;
  readonly options: NotificationOptions;
  readonly close = vi.fn();

  constructor(title: string, options: NotificationOptions) {
    super();
    this.title = title;
    this.options = options;
    FakeNotification.instances.push(this);
  }
}

describe("Notification", () => {
  it("指定した別窓のNotification APIとクリック先を使う", async () => {
    const focus = vi.fn();
    const open = vi.fn();
    const detachedWindow = {
      Notification: FakeNotification,
      focus,
      open,
    } as unknown as Window;

    expect(Notification.isSupported(detachedWindow)).toBe(true);

    const notification = new Notification(
      "返信通知",
      "新しい返信があります",
      "https://example.com/test/read.cgi/live/1/",
      "thread-reply",
      detachedWindow,
    );

    await expect(notification.ready).resolves.toBe(true);
    const systemNotification = FakeNotification.instances.at(-1);
    expect(systemNotification).toBeDefined();

    systemNotification?.dispatchEvent(new Event("click"));

    expect(focus).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      "https://example.com/test/read.cgi/live/1/",
      "_blank",
      "noopener,noreferrer",
    );
    expect(systemNotification?.close).toHaveBeenCalledOnce();
  });
});
