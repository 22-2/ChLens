import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import {
  BOTTOM_PANEL_THREAD_LIST_TAB_ID,
  BOTTOM_PANEL_WRITE_TAB_ID,
  BottomPanelProvider,
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
    activeTabId,
    togglePanel,
    threadListAutoRefreshEnabled,
    threadListAutoRefreshIntervalSec,
    setThreadListAutoRefreshEnabled,
    setThreadListAutoRefreshIntervalSec,
  } = useBottomPanel();

  return (
    <>
      <output data-testid="open">{String(isOpen)}</output>
      <output data-testid="active">{activeTabId}</output>
      <output data-testid="auto">{String(threadListAutoRefreshEnabled)}</output>
      <output data-testid="interval">{threadListAutoRefreshIntervalSec}</output>
      <button onClick={() => togglePanel(BOTTOM_PANEL_THREAD_LIST_TAB_ID)}>スレ一覧</button>
      <button onClick={() => togglePanel(BOTTOM_PANEL_WRITE_TAB_ID)}>書き込み</button>
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
