import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { container } from "src/service-container";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import type { Tab } from "src/view/browser/types";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const { dispatchMock, threadTab } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  threadTab: {
    id: "tab-1",
    history: [
      {
        type: "thread" as const,
        title: "Current Thread",
        threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
      },
    ],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  } satisfies Tab,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: {
      tabs: [threadTab],
      closedTabs: [],
    },
    dispatch: dispatchMock,
  }),
}));

describe("TabContextMenu", () => {
  beforeEach(() => {
    container.bookmark = {
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    dispatchMock.mockReset();
  });

  it("一般的なコピー操作は残し、dat URLはコマンドパレット専用にする", () => {
    render(
      <TabContextMenu
        tab={threadTab}
        position={{ x: 10, y: 10 }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "スレタイ&URLをコピー" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "datのURLをコピー" }),
    ).not.toBeInTheDocument();
  });
});
