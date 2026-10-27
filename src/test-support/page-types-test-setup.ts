import type { BrowserCommandDefinition } from "src/view/browser/commands/command-definition";
import { CommandRegistry } from "src/view/browser/extension/command-registry";
import {
  createExtensionOwner,
  type ExtensionOwner,
} from "src/view/browser/extension/extension-api";
import { registerBuiltInPageTypes } from "src/view/browser/shell/register-built-in-page-types";
import { afterEach, beforeEach } from "vite-plus/test";

/** テストごとに登録を解除し、他のテストへ状態を持ち越さない。 */
export function registerTestPageTypes(): () => void {
  const registry = new CommandRegistry<BrowserCommandDefinition>();
  const owners = new Map<string, ExtensionOwner>();
  registerBuiltInPageTypes((id) => {
    let owner = owners.get(id);
    if (!owner) {
      owner = createExtensionOwner(id, registry);
      owners.set(id, owner);
    }
    return owner.api;
  });
  return () => {
    for (const owner of owners.values()) owner.dispose();
  };
}

export function setupTestPageTypes(): void {
  let dispose: () => void;
  beforeEach(() => {
    dispose = registerTestPageTypes();
  });
  afterEach(() => {
    dispose();
  });
}
