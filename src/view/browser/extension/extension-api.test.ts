import { Settings } from "lucide-react";
import type { BrowserCommandDefinition } from "src/view/browser/commands/browser-commands";
import { CommandRegistry } from "src/view/browser/extension/command-registry";
import { createExtensionApi } from "src/view/browser/extension/extension-api";
import { describe, expect, it, vi } from "vite-plus/test";

interface TestCommand {
  id: string;
  value: string;
}

function createBrowserCommand(id: string): BrowserCommandDefinition {
  return {
    id,
    label: id,
    englishLabel: id,
    group: "navigation",
    icon: Settings,
    run: () => undefined,
  };
}

describe("拡張 API", () => {
  it("コマンド登録時だけスナップショットを更新して購読者へ通知する", () => {
    const registry = new CommandRegistry<TestCommand>();
    const listener = vi.fn();
    const subscription = registry.subscribe(listener);
    const initialSnapshot = registry.getSnapshot();

    registry.add({ id: "first", value: "1" }, "test");

    expect(registry.getSnapshot()).not.toBe(initialSnapshot);
    expect(registry.getSnapshot()).toEqual([{ id: "first", value: "1" }]);
    expect(listener).toHaveBeenCalledTimes(1);

    const unchangedSnapshot = registry.getSnapshot();
    expect(registry.getSnapshot()).toBe(unchangedSnapshot);
    subscription.dispose();
    subscription.dispose();
    registry.add({ id: "second", value: "2" }, "test");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("二重登録の解除で先行登録を消さず、解除を繰り返しても安全", () => {
    const registry = new CommandRegistry<TestCommand>();
    const original: TestCommand = { id: "shared", value: "original" };
    const first = registry.add(original, "first-owner");
    const duplicate = registry.add({ id: "shared", value: "duplicate" }, "second-owner");

    duplicate.dispose();
    duplicate.dispose();
    expect(registry.getSnapshot()).toEqual([original]);

    first.dispose();
    first.dispose();
    expect(registry.getSnapshot()).toEqual([]);
  });

  it("表示順指定で既存コマンドの直前へ挿入する", () => {
    const registry = new CommandRegistry<TestCommand>();
    registry.add({ id: "first", value: "1" }, "test");
    registry.add({ id: "last", value: "3" }, "test");

    registry.add({ id: "middle", value: "2" }, "test", "last");

    expect(registry.getSnapshot().map(({ id }) => id)).toEqual(["first", "middle", "last"]);
  });

  it("所有者の解除で登録と任意の後片付けをまとめて実行する", () => {
    const registry = new CommandRegistry<BrowserCommandDefinition>();
    const api = createExtensionApi("feature", registry);
    const cleanup = vi.fn();
    api.addCommand(createBrowserCommand("owned"));
    api.register(cleanup);

    api.dispose();
    api.dispose();

    expect(registry.getSnapshot()).toEqual([]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("登録後に個別解除した項目は所有者の解除でも再処理しない", () => {
    const registry = new CommandRegistry<BrowserCommandDefinition>();
    const api = createExtensionApi("feature", registry);
    const cleanup = vi.fn();
    const disposable = api.register(cleanup);

    disposable.dispose();
    disposable.dispose();
    api.dispose();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
