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

  subscribe = (listener: () => void): Disposable => {
    this.listeners.add(listener);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.listeners.delete(listener);
      },
    };
  };

  add(command: T, ownerId: string): Disposable {
    const existing = this.entries.get(command.id);
    if (existing) {
      logger.error("コマンドの二重登録を拒否しました", {
        id: command.id,
        ownerId,
        existingOwnerId: existing.ownerId,
      });
      return { dispose: () => undefined };
    }

    this.entries.set(command.id, { command, ownerId });
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
