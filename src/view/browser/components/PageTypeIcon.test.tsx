import { render } from "@testing-library/react";
import { PageTypeIcon } from "src/view/browser/components/PageTypeIcon";
import type { PageType } from "src/view/browser/types";
import { describe, expect, it } from "vite-plus/test";

const ALL_PAGE_TYPES: readonly PageType[] = [
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
  it("すべてのページ種別でアイコンを表示する", () => {
    for (const type of ALL_PAGE_TYPES) {
      const { container, unmount } = render(<PageTypeIcon type={type} />);

      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });
});
