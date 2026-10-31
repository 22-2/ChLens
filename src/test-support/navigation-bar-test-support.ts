import { act } from "@testing-library/react";
import { registerTestFilterCommands } from "src/test-support/filter-commands";
import {
  browserCommandRegistry,
  registerCoreCommands,
} from "src/view/browser/commands/browser-commands";
import { commandPalette } from "src/view/browser/commands/command-palette-store";
import {
  createExtensionOwner,
  type ExtensionOwner,
} from "src/view/browser/extension/extension-api";
import { afterEach, beforeEach } from "vite-plus/test";

let coreOwner: ExtensionOwner | null = null;

/** テストごとに、組み立て時のコマンドを作り直す。 */
export function setupNavigationBarCommands(): void {
  beforeEach(() => {
    coreOwner?.dispose();
    coreOwner = createExtensionOwner("core-test", browserCommandRegistry);
    registerCoreCommands(coreOwner.api);
    registerTestFilterCommands(coreOwner.api);
  });
  afterEach(() => {
    coreOwner?.dispose();
    coreOwner = null;
  });
}

// タイトルバーのピルをクリックしたときと同じく、コマンドパレット経由でURL入力を開く。
export function openUrlBar() {
  act(() => commandPalette.open("navigation"));
}
