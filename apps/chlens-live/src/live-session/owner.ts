export type LiveSessionMode = "live" | "playback";

export class LiveSessionBusyError extends Error {
  constructor(
    public readonly requestedMode: LiveSessionMode,
    public readonly activeMode: LiveSessionMode,
  ) {
    super(`Cannot start ${requestedMode} session while ${activeMode} session is active`);
    this.name = "LiveSessionBusyError";
  }
}

export interface LiveSessionLease {
  readonly mode: LiveSessionMode;
  release(): void;
}

export interface LiveSessionOwner {
  readonly currentMode?: LiveSessionMode | null;
  tryAcquire(mode: LiveSessionMode): LiveSessionLease | null;
}

/**
 * Process-local owner for the one active thread session.
 *
 * Playback must not share a polling owner with the live session: otherwise a late polling
 * response could overwrite the fixed historical snapshot while it is being replayed.
 */
export class MemoryLiveSessionOwner implements LiveSessionOwner {
  private activeMode: LiveSessionMode | null = null;

  get currentMode(): LiveSessionMode | null {
    return this.activeMode;
  }

  tryAcquire(mode: LiveSessionMode): LiveSessionLease | null {
    if (this.activeMode) return null;
    this.activeMode = mode;
    let released = false;

    return {
      mode,
      release: () => {
        if (released || this.activeMode !== mode) return;
        released = true;
        this.activeMode = null;
      },
    };
  }
}
