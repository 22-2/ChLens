import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SpotlightActionData, SpotlightProps } from "@mantine/spotlight";
import type React from "react";
import { CommandPalette } from "src/view/browser/components/CommandPalette";
import type { Page } from "src/view/browser/types";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, requestThreadResJumpMock, spotlightCloseMock, spotlightProps } = vi.hoisted(
  () => ({
    dispatchMock: vi.fn(),
    requestThreadResJumpMock: vi.fn(),
    spotlightCloseMock: vi.fn(),
    spotlightProps: { current: null as SpotlightProps | null },
  }),
);

let currentPage: Page = {
  type: "thread",
  title: "Current Thread",
  threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
};
let paneCount = 1;

vi.mock("@mantine/spotlight", () => ({
  Spotlight: Object.assign(
    (props: SpotlightProps) => {
      spotlightProps.current = props;
      const actions = props.actions.flatMap((entry) =>
        "actions" in entry ? entry.actions : [entry],
      ) as SpotlightActionData[];
      return (
        <div data-testid="spotlight" data-shortcut={String(props.shortcut)}>
          {actions.map((action) => (
            <button key={action.id} disabled={action.disabled} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      );
    },
    { close: spotlightCloseMock },
  ),
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
    spotlightCloseMock.mockReset();
    spotlightProps.current = null;
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
    expect(screen.getByRole("button", { name: "subject.txtのURLをコピー" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "datのURLをコピー" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "スレ全体をTOON形式でコピー" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "設定を開く" })).toBeInTheDocument();
  });

  it("レス番号ジャンプはパレットを閉じて入力ダイアログを開く", () => {
    render(<CommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: "レス番号を指定してジャンプ" }));

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

    fireEvent.click(screen.getByRole("button", { name: "2ペイン表示を解除" }));
    expect(dispatchMock).toHaveBeenCalledWith({ type: "CLOSE_PANE" });
  });

  it("Spotlightをスクロール可能かつ既存ポップアップより前面にする", () => {
    render(<CommandPalette />);

    expect(spotlightProps.current?.scrollable).toBe(true);
    expect(spotlightProps.current?.maxHeight).toBe("min(420px, 60vh)");
    expect(spotlightProps.current?.zIndex).toBe(40000);
  });
});
