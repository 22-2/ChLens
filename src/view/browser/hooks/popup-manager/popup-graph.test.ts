import type { PopupItem } from "src/view/browser/hooks/popup-manager/types";
import { describe, expect, it } from "vite-plus/test";
import { collectPopupBranchIds, isPopupDescendantOf, removePopupBranches } from "./popup-graph";

function createPopup(id: string, parentId?: string): PopupItem {
  return {
    id,
    type: "tree",
    x: 0,
    y: 0,
    z: 10000,
    payload: {
      resNum: 1,
      anchorPreviewDepth: 0,
    },
    ...(parentId == null ? {} : { parentId }),
  };
}

describe("popup graph", () => {
  it("parentIdからbranch全体を収集し、壊れた参照や循環で停止する", () => {
    const popups = [
      createPopup("root"),
      createPopup("child", "root"),
      createPopup("grandchild", "child"),
      createPopup("other"),
      createPopup("broken", "missing-parent"),
      createPopup("cycle-a", "cycle-b"),
      createPopup("cycle-b", "cycle-a"),
    ];

    const rootBranch = collectPopupBranchIds(popups, ["root"]);
    expect(rootBranch).toEqual(new Set(["root", "child", "grandchild"]));

    const cycleBranch = collectPopupBranchIds(popups, ["cycle-a"]);
    expect(cycleBranch).toEqual(new Set(["cycle-a", "cycle-b"]));
  });

  it("popup自身を含めず、parentIdの祖先だけを判定する", () => {
    const popups = [
      createPopup("root"),
      createPopup("child", "root"),
      createPopup("grandchild", "child"),
      createPopup("cycle-a", "cycle-b"),
      createPopup("cycle-b", "cycle-a"),
      createPopup("broken", "missing-parent"),
    ];

    expect(isPopupDescendantOf(popups, "grandchild", "root")).toBe(true);
    expect(isPopupDescendantOf(popups, "root", "root")).toBe(false);
    expect(isPopupDescendantOf(popups, "broken", "root")).toBe(false);
    expect(isPopupDescendantOf(popups, "cycle-a", "cycle-b")).toBe(true);
    expect(isPopupDescendantOf(popups, "cycle-a", "missing-ancestor")).toBe(false);
  });

  it("predicateに一致したpopupと子孫だけを削除し、入力配列を変更しない", () => {
    const popups = [
      createPopup("root"),
      createPopup("child", "root"),
      createPopup("grandchild", "child"),
      createPopup("other"),
    ];

    const remaining = removePopupBranches(popups, (item) => item.id === "child");

    expect(remaining.map((item) => item.id)).toEqual(["root", "other"]);
    expect(popups.map((item) => item.id)).toEqual(["root", "child", "grandchild", "other"]);
  });
});
