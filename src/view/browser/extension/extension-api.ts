import type { BrowserCommandDefinition } from "src/view/browser/commands/browser-commands";
import { CommandRegistry, type Disposable } from "src/view/browser/extension/command-registry";

export type ExtensionCommandRegistry = CommandRegistry<BrowserCommandDefinition>;

export interface ExtensionApi {
  addCommand: (command: BrowserCommandDefinition) => Disposable;
  register: (cleanup: () => void) => Disposable;
  dispose: () => void;
}

/** 機能単位の所有者を作り、登録物と後片付けをまとめて解除できるようにする。 */
export function createExtensionApi(
  ownerId: string,
  commandRegistry: ExtensionCommandRegistry,
): ExtensionApi {
  const disposables = new Set<Disposable>();
  let disposed = false;

  const own = (disposable: Disposable): Disposable => {
    if (disposed) {
      disposable.dispose();
      return disposable;
    }
    disposables.add(disposable);
    return {
      dispose: () => {
        if (!disposables.delete(disposable)) return;
        disposable.dispose();
      },
    };
  };

  return {
    addCommand: (command) => own(commandRegistry.add(command, ownerId)),
    register: (cleanup) => {
      let cleaned = false;
      return own({
        dispose: () => {
          if (cleaned) return;
          cleaned = true;
          cleanup();
        },
      });
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const disposable of [...disposables].reverse()) disposable.dispose();
      disposables.clear();
    },
  };
}
