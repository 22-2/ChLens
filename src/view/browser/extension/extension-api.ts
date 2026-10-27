import type { BrowserCommandDefinition } from "src/view/browser/commands/command-definition";
import { CommandRegistry, type Disposable } from "src/view/browser/extension/command-registry";

export type ExtensionCommandRegistry = CommandRegistry<BrowserCommandDefinition>;

/** 機能に渡す登録の入口。登録したものは、この API を作った所有者がまとめて解除する。 */
export interface ExtensionApi {
  addCommand: (
    command: BrowserCommandDefinition,
    options?: { beforeCommandId?: string },
  ) => Disposable;
  register: (cleanup: () => void) => Disposable;
}

/**
 * 機能単位の所有者。`api` を機能の登録関数へ渡し、`dispose` は組み立て側だけが呼ぶ。
 *
 * 変更理由: Obsidian の Plugin と同じく、解除はアプリ側の責務とする。機能に渡す API へ
 * `dispose` を含めると、機能が自分や共有された所有者を途中で解除できてしまうため分ける。
 */
export interface ExtensionOwner extends Disposable {
  readonly api: ExtensionApi;
}

/** 機能単位の所有者を作り、登録物と後片付けをまとめて解除できるようにする。 */
export function createExtensionOwner(
  ownerId: string,
  commandRegistry: ExtensionCommandRegistry,
): ExtensionOwner {
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
    api: {
      addCommand: (command, options) =>
        own(commandRegistry.add(command, ownerId, options?.beforeCommandId)),
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
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const disposable of [...disposables].reverse()) disposable.dispose();
      disposables.clear();
    },
  };
}
