import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  SpotlightActionProps,
  SpotlightRootProps,
  SpotlightSearchProps,
} from "@mantine/spotlight";
import type React from "react";
import { CommandPalette } from "src/view/browser/components/CommandPalette";
import type { Page } from "src/view/browser/types";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  dispatchMock,
  loadRecentCommandIdsMock,
  requestThreadResJumpMock,
  saveRecentCommandIdsMock,
  spotlightCloseMock,
  spotlightRootProps,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  loadRecentCommandIdsMock: vi.fn(async () => [] as string[]),
  requestThreadResJumpMock: vi.fn(),
  saveRecentCommandIdsMock: vi.fn(async () => undefined),
  spotlightCloseMock: vi.fn(),
  spotlightRootProps: { current: null as SpotlightRootProps | null },
}));

let currentPage: Page = {
  type: "thread",
  title: "Current Thread",
  threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
};
let paneCount = 1;

vi.mock("@mantine/spotlight", () => ({
  Spotlight: Object.assign(
    {},
    {
      Root: ({ children, ...props }: React.PropsWithChildren<SpotlightRootProps>) => {
        spotlightRootProps.current = props;
        return (
          <div data-testid="spotlight" data-shortcut={String(props.shortcut)}>
            {children}
          </div>
        );
      },
      Search: (props: SpotlightSearchProps) => (
        <input
          aria-label={props["aria-label"]}
          placeholder={props.placeholder}
          value={String(spotlightRootProps.current?.query ?? "")}
          onChange={(event) =>
            spotlightRootProps.current?.onQueryChange?.(event.currentTarget.value)
          }
        />
      ),
      ActionsList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
      Action: ({ id, label, rightSection, disabled, onClick, ...props }: SpotlightActionProps) => (
        <button id={id} aria-label={props["aria-label"]} disabled={disabled} onClick={onClick}>
          {label}
          {rightSection}
        </button>
      ),
      Empty: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
      Footer: ({ children }: React.PropsWithChildren) => <footer>{children}</footer>,
      close: spotlightCloseMock,
    },
  ),
}));

vi.mock("src/view/browser/commands/command-palette-history", () => ({
  loadRecentCommandIds: loadRecentCommandIdsMock,
  saveRecentCommandIds: saveRecentCommandIdsMock,
}));

vi.mock("@mantine/core", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Modal: ({
    children,
    opened,
    title,
  }: {
    children: React.ReactNode;
    opened: boolean;
    title: string;
  }) =>
    opened ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  TextInput: ({
    error,
    label,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    error?: React.ReactNode;
    label: string;
  }) => (
    <label>
      {label}
      <input {...props} />
      {error && <span>{error}</span>}
    </label>
  ),
}));

vi.mock("src/view/browser/utils/thread-read-state", () => ({
  requestThreadResJump: requestThreadResJumpMock,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => {
    const activeTab = {
      id: "tab-1",
      history: [currentPage],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    };
    return {
      state: { tabs: [activeTab] },
      activeTab,
      currentPage,
      dispatch: dispatchMock,
    };
  },
  useTabPanes: () => ({
    panes: Array.from({ length: paneCount }, (_, index) => ({
      id: `pane-${index + 1}`,
    })),
    activePaneId: "pane-1",
  }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useBottomPanel: () => ({
    isOpen: false,
    togglePanel: vi.fn(),
  }),
}));

describe("CommandPalette", () => {
  afterEach(() => {
    cleanup();
    dispatchMock.mockReset();
    requestThreadResJumpMock.mockReset();
    loadRecentCommandIdsMock.mockClear();
    saveRecentCommandIdsMock.mockReset();
    spotlightCloseMock.mockReset();
    spotlightRootProps.current = null;
    paneCount = 1;
    currentPage = {
      type: "thread",
      title: "Current Thread",
      threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
    };
  });

  it("Ctrl/Cmd+Shift+Pを登録し、スレッド用raw URLコマンドを表示する", () => {
    render(<CommandPalette />);

    expect(screen.getByTestId("spotlight")).toHaveAttribute("data-shortcut", "mod + shift + P");
    expect(screen.getByRole("button", { name: /subject\.txtのURLをコピー/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /datのURLをコピー/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /スレ全体をTOON形式でコピー/ })).toBeInTheDocument();
  });

  it("ホームではページ依存コマンドを表示しない", () => {
    currentPage = { type: "home", title: "ホーム" };
    render(<CommandPalette />);

    expect(screen.queryByRole("button", { name: "datのURLをコピー" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "スレ全体をTOON形式でコピー",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "現在のページURLをコピー" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /設定を開く/ })).toBeInTheDocument();
  });

  it("レス番号ジャンプはパレットを閉じて入力ダイアログを開く", () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: /レス番号を指定してジャンプ/ }));

    expect(spotlightCloseMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "レス番号へジャンプ" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("レス番号"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ジャンプ" }));

    expect(requestThreadResJumpMock).toHaveBeenCalledWith(
      "https://egg.5ch.net/test/read.cgi/software/123/",
      42,
    );
    expect(screen.queryByRole("dialog", { name: "レス番号へジャンプ" })).not.toBeInTheDocument();
  });

  it("2ペイン時は解除コマンドを表示して現在ペインを閉じる", () => {
    paneCount = 2;
    render(<CommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: /2ペイン表示を解除/ }));
    expect(dispatchMock).toHaveBeenCalledWith({ type: "CLOSE_PANE" });
  });

  it("Spotlightをスクロール可能かつ既存ポップアップより前面にする", () => {
    render(<CommandPalette />);

    expect(spotlightRootProps.current?.scrollable).toBe(true);
    expect(spotlightRootProps.current?.maxHeight).toBe("min(480px, 60vh)");
    expect(spotlightRootProps.current?.size).toBe(800);
    expect(spotlightRootProps.current?.zIndex).toBe(40000);
  });

  it("英語名で検索し、説明を表示しない", () => {
    render(<CommandPalette />);

    fireEvent.change(screen.getByLabelText("コマンドを検索"), {
      target: { value: "Open Settings" },
    });

    expect(screen.getByRole("button", { name: /設定を開く/ })).toHaveTextContent("Open Settings");
    expect(screen.queryByText("アプリの設定画面を開きます")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /現在のページを更新/ })).not.toBeInTheDocument();
  });
});
