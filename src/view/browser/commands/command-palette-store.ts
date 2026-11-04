export interface CommandPaletteState {
  opened: boolean;
  mode: "navigation" | "command";
  selected: number;
  owner: Window | null;
}

type StateListener = () => void;

let state: CommandPaletteState = {
  opened: false,
  mode: "command",
  selected: -1,
  owner: null,
};
const listeners = new Set<StateListener>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export const commandPaletteStore = {
  getState: () => state,
  subscribe: (listener: StateListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  updateState: (update: (current: CommandPaletteState) => CommandPaletteState) => {
    state = update(state);
    emit();
  },
};

// メニュー・ショートカット・コンポーネント内の閉じる処理で同一の状態を共有する。
export const commandPalette = {
  open: (mode: CommandPaletteState["mode"] = "command", owner: Window = window) => {
    commandPaletteStore.updateState((current) => ({
      ...current,
      opened: true,
      mode,
      selected: -1,
      owner,
    }));
  },
  close: () => {
    commandPaletteStore.updateState((current) => ({ ...current, opened: false }));
  },
  toggle: (owner: Window = window) => {
    commandPaletteStore.updateState((current) => ({
      ...current,
      opened: !(current.opened && current.owner === owner),
      owner,
    }));
  },
};
