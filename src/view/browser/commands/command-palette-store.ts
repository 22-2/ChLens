export interface CommandPaletteState {
  opened: boolean;
  mode: "navigation" | "command";
  selected: number;
}

type StateListener = () => void;

let state: CommandPaletteState = {
  opened: false,
  mode: "command",
  selected: -1,
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
  open: (mode: CommandPaletteState["mode"] = "command") => {
    commandPaletteStore.updateState((current) => ({
      ...current,
      opened: true,
      mode,
      selected: -1,
    }));
  },
  close: () => {
    commandPaletteStore.updateState((current) => ({ ...current, opened: false }));
  },
  toggle: () => {
    commandPaletteStore.updateState((current) => ({ ...current, opened: !current.opened }));
  },
};
