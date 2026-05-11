import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useThreadResContextMenu } from "src/view/browser/pages/thread/use-thread-res-context-menu";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import type { IRes } from "src/service-container/interfaces";

const mocks = vi.hoisted(() => ({
  ngAdd: vi.fn(),
  toastInfo: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    ng: {
      add: mocks.ngAdd,
    },
    toast: {
      info: mocks.toastInfo,
      success: vi.fn(),
    },
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabDispatch: () => mocks.dispatch,
}));

vi.mock("src/view/browser/utils/auto-refresh-pages", () => ({
  getAutoRefreshPageKey: () => "thread:test",
}));

vi.mock("src/view/browser/utils/legacy-app", () => ({
  getLegacyWriteHistoryService: () => null,
}));

const TARGET_RES: IRes = {
  num: 10,
  name: "name",
  mail: "",
  date: "date",
  id: "abc123",
  message: "message",
};

function HookHarness() {
  const [responses, setResponses] = useState<IRes[]>([TARGET_RES]);
  const [capturedItems, setCapturedItems] = useState<ContextMenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [miniAaResNums, setMiniAaResNums] = useState<Set<number>>(new Set());

  const { openThreadResContextMenu } = useThreadResContextMenu({
    addPopupContextMenu: (_x, _y, items) => {
      setCapturedItems(items);
    },
    closePopup: () => {},
    fetchThread: async () => {},
    filter: "all",
    filteredResponses: responses,
    handleAnchorClick: () => {},
    hideAnchorPreviewImmediately: () => {},
    miniAaResNums,
    page: {
      type: "thread",
      title: "thread title",
      threadUrl: "https://example.com/test/read.cgi/live/1/",
    },
    searchQuery,
    setFilter: () => {},
    setSearchQuery,
    setMiniAaResNums,
    setResponses,
  });

  return (
    <div>
      <output data-testid="response-class">
        {responses[0]?.class?.join(" ") ?? ""}
      </output>
      <button
        onClick={() => {
          const event = {
            preventDefault: () => {},
            clientX: 10,
            clientY: 20,
          } as unknown as React.MouseEvent;
          openThreadResContextMenu(event, TARGET_RES);
        }}
      >
        open
      </button>
      <button
        onClick={() => {
          capturedItems.find((item) => item.id === "add-ng-id")?.onSelect?.();
        }}
      >
        add-ng-id
      </button>
    </div>
  );
}

describe("useThreadResContextMenu", () => {
  afterEach(() => {
    cleanup();
    mocks.ngAdd.mockReset();
    mocks.toastInfo.mockReset();
    mocks.dispatch.mockReset();
  });

  it("ID/IPのNG追加は再起動後も有効なDSL形式で保存する", async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "add-ng-id" }));
    });

    expect(mocks.ngAdd).toHaveBeenCalledWith("ID(word=abc123)");
  });

  it("保存完了までは成功通知とローカル反映を進めない", async () => {
    let resolveNgAdd: (() => void) | null = null;
    mocks.ngAdd.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveNgAdd = resolve;
        }),
    );

    render(<HookHarness />);

    fireEvent.click(screen.getByRole("button", { name: "open" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "add-ng-id" }));
      await Promise.resolve();
    });

    expect(screen.getByTestId("response-class")).toBeEmptyDOMElement();
    expect(mocks.toastInfo).not.toHaveBeenCalled();

    await act(async () => {
      resolveNgAdd?.();
      await Promise.resolve();
    });

    expect(screen.getByTestId("response-class")).toHaveTextContent("ng");
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "NGに追加しました: ID(word=abc123)",
    );
  });
});
