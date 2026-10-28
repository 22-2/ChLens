import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ResMediaGallery } from "./ResMediaGallery";

vi.mock("./ExternalImage", () => ({
  ExternalImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const mocks = vi.hoisted(() => ({ save: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("../browser/image-save", () => ({ saveMediaImage: mocks.save }));
vi.mock("src/view/browser/hooks/use-toast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: () => ({ value: false }),
}));
vi.mock("src/view/browser/hooks/use-config-number-setting", () => ({
  useConfigNumberSetting: () => ({ value: 5 }),
}));

const image1 = "https://example.com/1.png";
const image2 = "https://example.com/2.png";
function Gallery({ onUrlClick = () => {} }: { onUrlClick?: (...args: unknown[]) => void }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <ResMediaGallery
      urls={[image1, image2]}
      onUrlClick={onUrlClick}
      expandedImageUrls={expanded}
      onToggleImage={(url) =>
        setExpanded((old) => {
          const next = new Set(old);
          if (next.has(url)) next.delete(url);
          else next.add(url);
          return next;
        })
      }
    />
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("レス内の画像展開", () => {
  it("画像ごとに展開して畳める", () => {
    render(<Gallery />);
    fireEvent.click(screen.getByRole("link", { name: image1 }));
    expect(screen.getByRole("button", { name: "画像を折りたたむ" })).toContainElement(
      screen.getByRole("img", { name: image1 }),
    );
    expect(screen.getByRole("link", { name: image2 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "画像を折りたたむ" }));
    expect(screen.getByRole("link", { name: image1 })).toBeInTheDocument();
  });
  it("展開画像の操作からビューアを開き、画像を縮小できる", () => {
    const onUrlClick = vi.fn();
    render(<Gallery onUrlClick={onUrlClick} />);
    fireEvent.click(screen.getByRole("link", { name: image1 }));
    fireEvent.click(screen.getByRole("button", { name: "ビューアで開く" }));
    expect(onUrlClick).toHaveBeenCalledWith(image1, [image1, image2], 0, undefined, [
      image1,
      image2,
    ]);
    expect(screen.getByRole("button", { name: "画像を折りたたむ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "画像を縮小" }));
    expect(screen.getByRole("link", { name: image1 })).toBeInTheDocument();
  });
  it("複数画像を一括保存し、失敗件数を通知する", async () => {
    mocks.save.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("失敗"));
    render(<Gallery />);
    fireEvent.click(screen.getByRole("button", { name: "このレスの画像をすべて保存" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("画像 2 件のうち 1 件を保存できませんでした"),
    );
    expect(mocks.save.mock.calls.map(([url]) => url)).toEqual([image1, image2]);
  });
});
