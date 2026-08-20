import { toastStore } from "src/service-container/toast-store";
import { afterEach, describe, expect, it } from "vite-plus/test";

describe("toastStore", () => {
  const createdIds: number[] = [];

  afterEach(() => {
    for (const id of createdIds.splice(0)) {
      toastStore.dismiss(id);
    }
  });

  it("publishes typed notifications and custom background colors", () => {
    toastStore.success("保存しました");
    toastStore.notify("同期しました", { backgroundColor: "green" });

    const records = toastStore.getSnapshot();
    const success = records.find((record) => record.message === "保存しました");
    const custom = records.find((record) => record.message === "同期しました");

    expect(success?.kind).toBe("success");
    expect(custom).toMatchObject({
      kind: "default",
      backgroundColor: "green",
    });
    createdIds.push(success?.id ?? -1, custom?.id ?? -1);
  });

  it("notifies subscribers and removes dismissed records", () => {
    let notifications = 0;
    const unsubscribe = toastStore.subscribe(() => {
      notifications += 1;
    });

    toastStore.info("更新しました");
    const record = toastStore.getSnapshot().find((item) => item.message === "更新しました");
    expect(record).toBeDefined();
    expect(notifications).toBe(1);

    toastStore.dismiss(record?.id ?? -1);
    expect(toastStore.getSnapshot()).not.toContainEqual(record);
    expect(notifications).toBe(2);
    unsubscribe();
  });
});
