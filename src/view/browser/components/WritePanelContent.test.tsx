import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { WritePanelContent } from "src/view/browser/components/WritePanelContent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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

vi.mock("src/view/browser/hooks/use-write", () => ({
  useWrite: () => ({
    name: "",
    mail: "",
    sage: false,
    message: "本文",
    status: "idle",
    statusText: "",
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
    configMock.get = vi.fn((key: string) =>
      key === "write_submit_ctrl_enter" ? "on" : "",
    );

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
});
