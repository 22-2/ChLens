import { render } from "@testing-library/react";
import { PageTypeIcon } from "src/view/browser/components/PageTypeIcon";
import type { PageType } from "src/view/browser/types";
import { describe, expect, it } from "vite-plus/test";

const ALL_PAGE_TYPES: readonly PageType[] = [
  "newTab",
  "home",
  "boardList",
  "threadList",
  "thread",
  "settings",
  "bookmarkList",
  "historyList",
  "writeHistoryList",
  "logList",
];

describe("PageTypeIcon", () => {
  it("板一覧に旧板ツリーのアイコンを使い、ホームは家のアイコンを維持する", () => {
    const { container, rerender } = render(<PageTypeIcon type="boardList" />);
    expect(container.querySelector(".lucide-list-tree")).not.toBeNull();
    rerender(<PageTypeIcon type="home" />);
    expect(container.querySelector(".lucide-house")).not.toBeNull();
  });

  it("すべてのページ種別でアイコンを表示する", () => {
    for (const type of ALL_PAGE_TYPES) {
      const { container, unmount } = render(<PageTypeIcon type={type} />);

      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });
});
