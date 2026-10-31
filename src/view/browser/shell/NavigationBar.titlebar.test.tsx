import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { container } from "src/service-container";
import { dispatchMock, orientationHolder, paneHolder } from "src/test-support/navigation-bar-mocks";
import {
  openUrlBar,
  setupNavigationBarCommands,
} from "src/test-support/navigation-bar-test-support";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { commandPalette } from "src/view/browser/commands/command-palette-store";
import { NavigationBar } from "src/view/browser/shell/NavigationBar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// browser-commands は拡張機能向け依存を含むため、DOM単体テストではAPIモジュールを差し替える。
vi.mock("webextension-polyfill", () => ({ default: {} }));
vi.mock("src/view/browser/utils/thread-read-state", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createThreadReadStateModule(),
);
vi.mock("src/view/browser/commands/command-palette-history", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createCommandPaletteHistoryModule(),
);
vi.mock("src/view/browser/state/tabs/use-tab-store", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createTabStoreModule(),
);
vi.mock("src/features/tabs/browser/use-tab-bar-orientation", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createTabBarOrientationModule(),
);
vi.mock("src/view/browser/hooks/use-bottom-panel", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createBottomPanelModule(),
);

setupNavigationBarCommands();

describe("NavigationBar titlebar slot", () => {
  let slot: HTMLDivElement;
  let commandCenterSlot: HTMLDivElement;

  beforeEach(() => {
    orientationHolder.value = "vertical";
    paneHolder.panes = [{ id: "pane-1" }];
    paneHolder.activePaneId = "pane-1";

    container.history = {
      get: vi.fn(async () => []),
    } as unknown as typeof container.history;
    container.bookmark = {
      promiseFirstScan: Promise.resolve(true),
      ready: vi.fn(async () => undefined),
      getAll: vi.fn(() => []),
      import: vi.fn(async () => true),
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      clearReadState: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
      getAllBoards: vi.fn(() => []),
    };
    container.message = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    container.toast = {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    slot = document.createElement("div");
    slot.className = "title-bar__nav-slot";
    slot.dataset.paneId = "pane-1";
    document.body.appendChild(slot);

    commandCenterSlot = document.createElement("div");
    commandCenterSlot.className = "title-bar__command-center-slot";
    commandCenterSlot.dataset.paneId = "pane-1";
    document.body.appendChild(commandCenterSlot);
  });

  afterEach(() => {
    slot.remove();
    commandCenterSlot.remove();
    orientationHolder.value = "horizontal";
    paneHolder.activePaneId = "pane-1";
    cleanup();
    commandPalette.close();
    dispatchMock.mockReset();
  });

  it("垂直かつアクティブペインのとき操作ボタンをスロットへポータルする", () => {
    const { container } = render(
      <div className="pane-column__chrome">
        <NavigationBar />
      </div>,
    );
    const chrome = container.querySelector(".pane-column__chrome") as HTMLElement;

    expect(chrome).toBeEmptyDOMElement();
    expect(slot.querySelector(".nav-bar--titlebar")).not.toBeNull();
    expect(slot.querySelector('[title="URLバーを表示"]')).toBeNull();
    expect(slot.querySelector('[title="メニュー"]')).not.toBeNull();
  });

  it("垂直でも非アクティブペインの操作欄を表示しない", () => {
    paneHolder.panes = [{ id: "pane-1" }, { id: "pane-2" }];
    paneHolder.activePaneId = "pane-2";

    render(
      <div className="pane-column__chrome">
        <NavigationBar />
      </div>,
    );

    expect(slot.querySelector(".nav-bar--titlebar")).toBeNull();
  });

  it("垂直では別ペインの受け口へポータルしない", () => {
    const otherSlot = document.createElement("div");
    otherSlot.className = "title-bar__nav-slot";
    otherSlot.dataset.paneId = "pane-2";
    document.body.appendChild(otherSlot);

    try {
      render(
        <div className="pane-column__chrome">
          <NavigationBar />
        </div>,
      );

      expect(slot.querySelector(".nav-bar--titlebar")).not.toBeNull();
      expect(otherSlot.querySelector(".nav-bar")).toBeNull();
    } finally {
      otherSlot.remove();
    }
  });

  it("垂直でもスロットが無いときはインラインに描画する", () => {
    slot.remove();

    const { container } = render(
      <div className="pane-column__chrome">
        <NavigationBar />
      </div>,
    );

    expect(container.querySelector(".pane-column__chrome .nav-bar")).not.toBeNull();
  });

  it("URL入力はタイトルバー中央の受け口へポータルする", () => {
    const { container } = render(
      <div className="pane-column__chrome">
        <NavigationBar />
      </div>,
    );

    expect(commandCenterSlot).toBeEmptyDOMElement();

    openUrlBar();

    expect(commandCenterSlot.querySelector(".nav-bar__url-input")).not.toBeNull();
    // 右上のボタン群や元の場所へは入力欄を出さない。
    expect(slot.querySelector(".nav-bar__url-input")).toBeNull();
    expect(container.querySelector(".nav-bar__url-input")).toBeNull();
  });

  it("フォーカスアウトで受け口の入力欄を閉じる", () => {
    render(
      <div className="pane-column__chrome">
        <NavigationBar />
      </div>,
    );

    openUrlBar();
    expect(commandCenterSlot.querySelector(".nav-bar__url-input")).not.toBeNull();

    fireEvent.blur(commandCenterSlot.querySelector(".nav-bar__url-input") as HTMLInputElement);

    expect(commandCenterSlot).toBeEmptyDOMElement();
  });

  it("別ペインのオムニバー受け口には入力欄を出さない", () => {
    const otherCommandCenterSlot = document.createElement("div");
    otherCommandCenterSlot.className = "title-bar__command-center-slot";
    otherCommandCenterSlot.dataset.paneId = "pane-2";
    document.body.appendChild(otherCommandCenterSlot);

    try {
      render(
        <div className="pane-column__chrome">
          <NavigationBar />
        </div>,
      );

      openUrlBar();

      expect(commandCenterSlot.querySelector(".nav-bar__url-input")).not.toBeNull();
      expect(otherCommandCenterSlot).toBeEmptyDOMElement();
    } finally {
      otherCommandCenterSlot.remove();
    }
  });

  it("水平でもアクティブペインの操作ボタンをタイトルバーの受け口へポータルする", () => {
    orientationHolder.value = "horizontal";

    const { container } = render(
      <div className="pane-column__chrome">
        <NavigationBar />
      </div>,
    );

    expect(container.querySelector(".pane-column__chrome")).toBeEmptyDOMElement();
    expect(slot.querySelector('[title="メニュー"]')).not.toBeNull();
  });

  it("水平で受け口を持たない非アクティブペインはボタンを描画しない", () => {
    orientationHolder.value = "horizontal";
    paneHolder.panes = [{ id: "pane-1" }, { id: "pane-2" }];
    paneHolder.activePaneId = "pane-2";
    slot.remove();

    const { container } = render(
      <div className="pane-column__chrome">
        <NavigationBar />
      </div>,
    );

    expect(container.querySelector(".pane-column__chrome .nav-bar")).toBeNull();
  });

  it("受け口が無い環境ではURL入力もインラインに描画し、フォーカスアウトで閉じる", () => {
    orientationHolder.value = "horizontal";
    slot.remove();
    commandCenterSlot.remove();

    const { container } = render(<NavigationBar />);

    openUrlBar();
    expect(container.querySelector(".nav-bar .nav-bar__url-input")).not.toBeNull();

    fireEvent.blur(container.querySelector(".nav-bar__url-input") as HTMLInputElement);

    expect(container.querySelector(".nav-bar__url-input")).toBeNull();
  });
});

setupTestPageTypes();
