import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  BottomPanelProvider,
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storage = { value: null as string | null };

vi.mock("src/app/Store2Storage", () => ({
  getStore2String: () => storage.value,
  setStore2String: (_key: string, value: string) => {
    storage.value = value;
  },
}));

const PanelProbe: React.FC = () => {
  const {
    isOpen,
    height,
    openPanel,
    openWritePanelWithText,
    writePanelInsertRequest,
    setHeight,
    setActivePanelTab,
    activePanelTabId,
    togglePanel,
    threadListAutoRefreshEnabled,
    threadListAutoRefreshIntervalSec,
    setThreadListAutoRefreshEnabled,
    setThreadListAutoRefreshIntervalSec,
  } = useBottomPanel();

  return (
    <>
      <output data-testid="height">{height}</output>
      <output data-testid="insert">{writePanelInsertRequest?.text}</output>
      <output data-testid="open">{String(isOpen)}</output>
      <output data-testid="active">{activePanelTabId}</output>
      <output data-testid="auto">{String(threadListAutoRefreshEnabled)}</output>
      <output data-testid="interval">{threadListAutoRefreshIntervalSec}</output>
      <button onClick={() => togglePanel(BOTTOM_PANEL_THREAD_LIST_TAB_ID)}>スレ一覧</button>
      <button onClick={() => togglePanel(BOTTOM_PANEL_WRITE_TAB_ID)}>書き込み</button>
      <button onClick={() => openWritePanelWithText(">>10\n")}>返信</button>
      <button onClick={() => openPanel(BOTTOM_PANEL_WRITE_TAB_ID)}>書き込みを開く</button>
      <button onClick={() => setActivePanelTab(BOTTOM_PANEL_WRITE_TAB_ID)}>書き込みタブ</button>
      <button onClick={() => setHeight(320)}>高さを調整</button>
      <button onClick={() => setThreadListAutoRefreshEnabled(true)}>自動更新</button>
      <button onClick={() => setThreadListAutoRefreshIntervalSec(15)}>15秒</button>
    </>
  );
};

describe("use-bottom-panel", () => {
  beforeEach(() => {
    storage.value = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("タブごとのボタンを1クリックで開閉し、別タブへは開いたまま切り替える", () => {
    render(
      <BottomPanelProvider>
        <PanelProbe />
      </BottomPanelProvider>,
    );

    expect(screen.getByTestId("open")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "書き込み" }));
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    expect(screen.getByTestId("active")).toHaveTextContent(BOTTOM_PANEL_WRITE_TAB_ID);

    fireEvent.click(screen.getByRole("button", { name: "スレ一覧" }));
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    expect(screen.getByTestId("active")).toHaveTextContent(BOTTOM_PANEL_THREAD_LIST_TAB_ID);

    fireEvent.click(screen.getByRole("button", { name: "スレ一覧" }));
    expect(screen.getByTestId("open")).toHaveTextContent("false");
  });

  it.each(["返信", "書き込み", "書き込みを開く", "書き込みタブ"])(
    "%sからスレ一覧を切り替えても書き込みの高さで開く",
    (action) => {
      render(
        <BottomPanelProvider>
          <PanelProbe />
        </BottomPanelProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "スレ一覧" }));
      expect(screen.getByTestId("height")).toHaveTextContent(String(window.innerHeight / 2));
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(screen.getByTestId("open")).toHaveTextContent("true");
      expect(screen.getByTestId("active")).toHaveTextContent(BOTTOM_PANEL_WRITE_TAB_ID);
      expect(screen.getByTestId("height")).toHaveTextContent(String(DEFAULT_BOTTOM_PANEL_HEIGHT));
      expect(JSON.parse(storage.value ?? "{}")).toMatchObject({
        height: DEFAULT_BOTTOM_PANEL_HEIGHT,
        activeTabId: BOTTOM_PANEL_WRITE_TAB_ID,
        isOpen: true,
      });
    },
  );

  it("スレ一覧を閉じた後の返信でも書き込みの高さへ戻す", () => {
    render(
      <BottomPanelProvider>
        <PanelProbe />
      </BottomPanelProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "スレ一覧" }));
    fireEvent.click(screen.getByRole("button", { name: "スレ一覧" }));
    fireEvent.click(screen.getByRole("button", { name: "返信" }));
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    expect(screen.getByTestId("height")).toHaveTextContent(String(DEFAULT_BOTTOM_PANEL_HEIGHT));
    expect(screen.getByTestId("insert")).toHaveTextContent(">>10");
  });

  it("表示中の返信追記と閉じる操作では手動調整した高さを保つ", () => {
    render(
      <BottomPanelProvider>
        <PanelProbe />
      </BottomPanelProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "書き込み" }));
    fireEvent.click(screen.getByRole("button", { name: "高さを調整" }));
    fireEvent.click(screen.getByRole("button", { name: "返信" }));
    expect(screen.getByTestId("open")).toHaveTextContent("true");
    expect(screen.getByTestId("height")).toHaveTextContent("320");
    expect(screen.getByTestId("insert")).toHaveTextContent(">>10");
    fireEvent.click(screen.getByRole("button", { name: "書き込み" }));
    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(screen.getByTestId("height")).toHaveTextContent("320");
    fireEvent.click(screen.getByRole("button", { name: "書き込み" }));
    expect(screen.getByTestId("height")).toHaveTextContent(String(DEFAULT_BOTTOM_PANEL_HEIGHT));
  });

  it("スレ一覧の自動更新設定と間隔を保存する", () => {
    render(
      <BottomPanelProvider>
        <PanelProbe />
      </BottomPanelProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "自動更新" }));
    fireEvent.click(screen.getByRole("button", { name: "15秒" }));
    expect(screen.getByTestId("auto")).toHaveTextContent("true");
    expect(screen.getByTestId("interval")).toHaveTextContent("15");
    expect(storage.value).toContain("threadListAutoRefreshIntervalSec");
  });
});
