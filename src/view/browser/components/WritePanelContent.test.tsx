import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { WritePanelContent } from "src/view/browser/components/WritePanelContent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  clearWritePanelInsertRequest: vi.fn(),
  closePanel: vi.fn(),
  message: "本文",
  writePanelInsertRequest: null as { id: number; text: string } | null,
  status: "idle" as "idle" | "submitting" | "confirm" | "success" | "error",
  statusText: "",
  submit: vi.fn().mockResolvedValue(undefined),
  setName: vi.fn(),
  setMail: vi.fn(),
  setSage: vi.fn(),
  setMessage: vi.fn(),
  handleSubmit: vi.fn(),
  handleRetry: vi.fn(),
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    currentPage: {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    },
  }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useBottomPanel: () => ({
    writePanelInsertRequest: mocks.writePanelInsertRequest,
    clearWritePanelInsertRequest: mocks.clearWritePanelInsertRequest,
    closePanel: mocks.closePanel,
  }),
}));

vi.mock("src/view/browser/hooks/use-write", () => ({
  useWrite: () => ({
    name: "",
    mail: "",
    sage: false,
    message: mocks.message,
    status: mocks.status,
    statusText: mocks.statusText,
    canSubmit: true,
    iframeRef: { current: null },
    setName: mocks.setName,
    setMail: mocks.setMail,
    setSage: mocks.setSage,
    setMessage: mocks.setMessage,
    submit: mocks.submit,
    handleSubmit: mocks.handleSubmit,
    handleRetry: mocks.handleRetry,
  }),
}));

describe("WritePanelContent", () => {
  let configMock: IConfig;
  let messageMock: IMessage;

  beforeEach(() => {
    mocks.clearWritePanelInsertRequest.mockClear();
    mocks.closePanel.mockClear();
    mocks.message = "本文";
    mocks.writePanelInsertRequest = null;
    mocks.status = "idle";
    mocks.statusText = "";
    mocks.submit.mockClear();
    mocks.setName.mockClear();
    mocks.setMail.mockClear();
    mocks.setSage.mockClear();
    mocks.setMessage.mockClear();
    mocks.handleSubmit.mockClear();
    mocks.handleRetry.mockClear();

    configMock = {
      get: vi.fn(() => "off"),
      set: vi.fn().mockResolvedValue(undefined),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    messageMock = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    container.config = configMock;
    container.message = messageMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Ctrl+EnterオプションON時はテキストエリアでCtrl+Enter投稿できる", () => {
    configMock.get = vi.fn((key: string) => (key === "write_submit_ctrl_enter" ? "on" : ""));

    render(<WritePanelContent />);

    const textarea = screen.getByPlaceholderText("本文を入力...");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+EnterオプションOFF時はCtrl+Enterしても投稿しない", () => {
    render(<WritePanelContent />);

    const textarea = screen.getByPlaceholderText("本文を入力...");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("Ctrl+Enterとsageの操作欄をパネル内に表示しない", () => {
    render(<WritePanelContent />);

    expect(screen.queryByText("Ctrl+Enterで書き込む")).not.toBeInTheDocument();
    expect(screen.queryByText("sage", { selector: "label" })).not.toBeInTheDocument();
  });

  it("歯車ボタンから書き込み設定を開いて各項目を変更できる", () => {
    render(<WritePanelContent />);

    fireEvent.click(screen.getByRole("button", { name: "書き込み設定" }));

    const dialog = screen.getByRole("dialog", { name: "書き込み設定" });
    expect(
      within(dialog).getByRole("checkbox", { name: "Ctrl+Enterで書き込む" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "sageで書き込む" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: "レス後に書き込みパネルを閉じる" }),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Ctrl+Enterで書き込む" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "sageで書き込む" }));
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "レス後に書き込みパネルを閉じる" }),
    );

    expect(configMock.set).toHaveBeenCalledWith("write_submit_ctrl_enter", "on");
    expect(configMock.set).toHaveBeenCalledWith("write_close_panel_after_submit", "on");
    expect(mocks.setSage).toHaveBeenCalledWith(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "書き込み設定" })).not.toBeInTheDocument();
  });

  it("右クリック返信の挿入要求が来たら既存本文へ追記する", async () => {
    mocks.writePanelInsertRequest = {
      id: 1,
      text: ">>10\n",
    };

    render(<WritePanelContent />);

    expect(mocks.setMessage).toHaveBeenCalledWith("本文\n>>10\n");
    expect(mocks.clearWritePanelInsertRequest).toHaveBeenCalledWith(1);
  });

  it("書き込みエラーをダイアログへ全文表示し、閉じた後も再入力できる", async () => {
    const errorMessage = "書き込み失敗: " + "サーバーから返された長いエラー内容。".repeat(12);
    mocks.status = "error";
    mocks.statusText = errorMessage;

    render(<WritePanelContent />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("write-panel__error-dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(errorMessage);

    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const retryButton = screen.getByRole("button", { name: "再入力" });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mocks.handleRetry).toHaveBeenCalledTimes(1);
  });

  it("エラー本文が空でもフォールバックをダイアログへ表示する", async () => {
    mocks.status = "error";
    mocks.statusText = "";

    render(<WritePanelContent />);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("書き込みに失敗しました");
  });

  it("書き込み成功時に設定がONならパネルを閉じる", () => {
    configMock.get = vi.fn((key: string) =>
      key === "write_close_panel_after_submit" ? "on" : "off",
    );
    mocks.status = "success";

    render(<WritePanelContent />);

    expect(mocks.closePanel).toHaveBeenCalledTimes(1);
  });

  it("書き込み失敗の本文をボタン下へ重ねて表示しない", () => {
    mocks.status = "error";
    mocks.statusText = "書き込み結果を確認できませんでした";

    render(<WritePanelContent />);

    expect(screen.queryByText(mocks.statusText, { selector: "span" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(mocks.statusText);
  });
});
