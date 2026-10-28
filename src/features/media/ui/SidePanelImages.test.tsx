import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMediaImageStore } from "src/features/media/browser/use-media-image-store";
import { useMediaViewerStore } from "src/features/media/browser/use-media-viewer-store";
import { SidePanelImages } from "src/features/media/ui/SidePanelImages";
import type { IRes } from "src/service-container/interfaces";
import { publishThreadSnapshot, useThreadSnapshots } from "src/view/browser/state/thread-snapshot";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  manual: true,
  jump: vi.fn(),
  download: vi.fn(() => Promise.resolve()),
}));
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: (key: string) => ({
    value: key === "manual_image_loading" && mocks.manual,
    setValue: vi.fn(),
  }),
}));
vi.mock("src/view/browser/hooks/use-config-number-setting", () => ({
  useConfigNumberSetting: () => ({ value: 5, setValue: vi.fn() }),
}));
vi.mock("src/features/media/browser/image-download-preflight", () => ({
  allowImageWithinCurrentLimit: vi.fn(),
  requestMediaImageDownload: mocks.download,
}));
vi.mock("src/view/browser/utils/thread-read-state", () => ({ requestThreadResJump: mocks.jump }));

const page = { type: "thread" as const, title: "スレ", threadUrl: "https://example.com/thread" };
const imageUrl = "https://images.example.com/a.jpg";
const responses: IRes[] = [
  { num: 1, name: "", mail: "", date: "", message: "画像なし" },
  { num: 2, name: "", mail: "", date: "", message: `${imageUrl} 画像のレス` },
];

function publish(blurredResNums = new Set<number>()) {
  publishThreadSnapshot("tab", Symbol(), {
    threadUrl: page.threadUrl,
    responses,
    visibleResponses: responses,
    replyIndex: new Map(),
    updatedAt: 0,
    messageProtocol: "https:",
    blurredResNums,
    imageBlurRadius: 4,
    loading: false,
    error: null,
    expired: false,
  });
}

describe("画像一覧", () => {
  afterEach(() => {
    cleanup();
    mocks.manual = true;
    vi.clearAllMocks();
    useThreadSnapshots.setState({ entries: new Map() });
    useMediaImageStore.setState({ images: new Map() });
    useMediaViewerStore.setState({ viewer: null, viewerScopeId: null });
  });

  it("手動取得の設定では、パネルを開いただけで画像を取得しない", () => {
    publish();
    render(<SidePanelImages tabId="tab" page={page} />);
    expect(screen.getByText("1 件")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "画像を読み込む: >>2 の画像" }));
    expect(mocks.download).toHaveBeenCalledWith(imageUrl, expect.any(String), expect.anything());
  });

  it("画像一覧の右クリックからビューアで開ける", async () => {
    publish();
    const { container } = render(<SidePanelImages tabId="tab" page={page} />);
    fireEvent.contextMenu(container.querySelector(".side-panel__image")!);
    fireEvent.click(await screen.findByRole("menuitem", { name: "ビューアで開く" }));
    expect(useMediaViewerStore.getState().viewer?.label).toBe(imageUrl);
    expect(useMediaViewerStore.getState().viewerScopeId).toBe(`tab\u0000${page.threadUrl}`);
  });

  it("取得済みの画像は本文と同じビューアーで開き、レスへ移動できる", () => {
    useMediaImageStore.setState({
      images: new Map([[imageUrl, { status: "loaded", version: 1, fallbackSrc: null }]]),
    });
    publish(new Set([2]));
    const { container } = render(<SidePanelImages tabId="tab" page={page} />);
    expect(container.querySelector(".side-panel__image--blurred")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: ">>2 の画像を拡大" }));
    expect(useMediaViewerStore.getState().viewerScopeId).toBe(`tab\u0000${page.threadUrl}`);
    fireEvent.click(screen.getByRole("button", { name: /画像のレス/ }));
    expect(mocks.jump).toHaveBeenCalledWith(page.threadUrl, 2, "tab", true);
  });

  it("画像がなければその旨を表示する", () => {
    publishThreadSnapshot("tab", Symbol(), {
      threadUrl: page.threadUrl,
      responses: responses.slice(0, 1),
      visibleResponses: responses.slice(0, 1),
      updatedAt: 0,
      replyIndex: new Map(),
      messageProtocol: "https:",
      blurredResNums: new Set<number>(),
      imageBlurRadius: 4,
      loading: false,
      error: null,
      expired: false,
    });
    render(<SidePanelImages tabId="tab" page={page} />);
    expect(screen.getByText("画像はありません。")).toBeInTheDocument();
  });
});
