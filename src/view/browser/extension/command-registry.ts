import { createLogger } from "src/app/logger";

const logger = createLogger("view/browser/extension");

export interface Disposable {
  dispose: () => void;
}

export interface IdentifiedCommand {
  id: string;
}

/** コマンド定義を保持し、変更時だけ購読者へ通知する。 */
export class CommandRegistry<T extends IdentifiedCommand> {
  private readonly entries = new Map<string, { command: T; ownerId: string }>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly T[] = [];

  getSnapshot = (): readonly T[] => this.snapshot;

  // React の useSyncExternalStore へそのまま渡せるよう、購読解除は関数で返す。
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  add(command: T, ownerId: string, beforeCommandId?: string): Disposable {
    const existing = this.entries.get(command.id);
    if (existing) {
      logger.error("コマンドの二重登録を拒否しました", {
        id: command.id,
        ownerId,
        existingOwnerId: existing.ownerId,
      });
      return { dispose: () => undefined };
    }

    const entry = { command, ownerId };
    if (beforeCommandId && !this.entries.has(beforeCommandId)) {
      // 変更理由: 基準のコマンドが未登録だと表示順が黙って変わるため、登録順の誤りを追えるよう記録する。
      // 登録自体は拒否せず末尾へ追加し、コマンドを使えない状態にはしない。
      logger.warn("表示順の基準コマンドが未登録のため、末尾へ登録しました", {
        id: command.id,
        ownerId,
        beforeCommandId,
      });
    }
    if (beforeCommandId && this.entries.has(beforeCommandId)) {
      const reorderedEntries = [...this.entries.entries()];
      const insertionIndex = reorderedEntries.findIndex(([id]) => id === beforeCommandId);
      reorderedEntries.splice(insertionIndex, 0, [command.id, entry]);
      this.entries.clear();
      for (const [id, registeredEntry] of reorderedEntries) {
        this.entries.set(id, registeredEntry);
      }
    } else {
      this.entries.set(command.id, entry);
    }
    this.updateSnapshot();
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (this.entries.get(command.id)?.command !== command) return;
        this.entries.delete(command.id);
        this.updateSnapshot();
      },
    };
  }

  private updateSnapshot(): void {
    this.snapshot = [...this.entries.values()].map(({ command }) => command);
    for (const listener of this.listeners) listener();
  }
}
