import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { container } from "src/service-container/index";
import { AutoRefreshStatusItem } from "src/view/browser/components/AutoRefreshStatusItem";
import {
  StatusBar,
  StatusBarProvider,
} from "src/view/browser/components/StatusBar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentPage: {
    type: "thread",
    title: "スレッド",
    threadUrl: "https://example.com/test/read.cgi/software/1/",
  },
  autoRefreshPanel: {
    isOnThread: true,
    isEnabled: false,
    intervalSec: 30,
    toggle: vi.fn(),
    setIntervalSec: vi.fn(),
  },
  autoNextThreadSetting: {
    enabled: false,
    setEnabled: vi.fn(),
  },
  canAutoScroll: false,
  isPaused: false,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({ currentPage: mocks.currentPage }),
}));

vi.mock("src/view/browser/hooks/use-auto-refresh-panel", () => ({
  MIN_INTERVAL_SEC: 5,
  MAX_INTERVAL_SEC: 120,
  useAutoRefreshPanel: () => mocks.autoRefreshPanel,
}));

vi.mock("src/view/browser/hooks/use-auto-next-thread-setting", () => ({
  useAutoNextThreadSetting: () => mocks.autoNextThreadSetting,
}));

vi.mock("src/view/browser/hooks/use-auto-scroll-state", () => ({
  useAutoScrollState: () => ({
    canAutoScroll: mocks.canAutoScroll,
    isAutoScrolling: false,
    isPaused: mocks.isPaused,
  }),
}));

function createRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 120,
    bottom: 144,
    left: 48,
    right: 160,
    width: 112,
    height: 24,
    toJSON: () => ({}),
  } as DOMRect;
}

function renderItem(): void {
  render(
    <StatusBarProvider>
      <AutoRefreshStatusItem />
      <StatusBar />
    </StatusBarProvider>,
  );
}

describe("AutoRefreshStatusItem", () => {
  beforeEach(() => {
    mocks.currentPage = {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    };
    mocks.autoRefreshPanel = {
      isOnThread: true,
      isEnabled: false,
      intervalSec: 30,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };
    mocks.autoNextThreadSetting = {
      enabled: false,
      setEnabled: vi.fn(),
    };
    mocks.canAutoScroll = false;
    mocks.isPaused = false;

    container.config = {
      get: vi.fn((key: string) => {
        if (key === "auto_load_second_board") {
          return "0";
        }
        return "0";
      }),
      set: vi.fn(),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("スレッド用ミニウィンドウを開き、同じボタンの再クリックで閉じる", () => {
    renderItem();

    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    expect(screen.getByText("スレッド自動更新")).toBeInTheDocument();
    expect(screen.getByText("自動次スレ移動")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "自動スクロールスタイル" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    fireEvent.pointerDown(button);
    fireEvent.click(button);

    expect(screen.queryByText("スレッド自動更新")).not.toBeInTheDocument();
  });

  it("スレ一覧では別内容のミニウィンドウを表示する", () => {
    mocks.currentPage = {
      type: "threadList",
      title: "板",
      boardUrl: "https://example.com/software/",
      boardTitle: "Software",
    };

    renderItem();

    const button = screen.getByRole("button", { name: /スレ一覧自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    expect(screen.getByText("スレ一覧自動更新")).toBeInTheDocument();
    expect(screen.getByText("20秒未満では無効になります")).toBeInTheDocument();
    expect(
      screen.queryByText("自動スクロールスタイル"),
    ).not.toBeInTheDocument();
  });

  it("スレッドでもスレ一覧でもないページでは表示しない", () => {
    mocks.currentPage = {
      type: "home",
      title: "ホーム",
    };

    renderItem();

    expect(screen.queryByRole("button", { name: /自動更新/ })).toBeNull();
  });

  it("ポップアップ表示中の一時停止状態をホバーラベルで示す", () => {
    mocks.autoRefreshPanel = {
      isOnThread: true,
      isEnabled: true,
      intervalSec: 30,
      toggle: vi.fn(),
      setIntervalSec: vi.fn(),
    };
    mocks.isPaused = true;

    renderItem();

    expect(
      screen.getByRole("button", {
        name: /一時停止中（ポップアップ表示中, 30秒間隔）/,
      }),
    ).toBeInTheDocument();
  });

  it("ミニウィンドウから自動次スレ移動を切り替えられる", () => {
    renderItem();

    const button = screen.getByRole("button", { name: /自動更新/ });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(),
    });

    fireEvent.click(button);

    const nextThreadToggle = screen
      .getByText("自動次スレ移動")
      .closest(".mini-window__toggle-row")
      ?.querySelector("button");

    expect(nextThreadToggle).not.toBeNull();
    fireEvent.click(nextThreadToggle as HTMLButtonElement);

    expect(mocks.autoNextThreadSetting.setEnabled).toHaveBeenCalledWith(true);
  });
});
