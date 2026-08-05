import { captureRootSelection, restoreRootSelection } from "src/view/browser/utils/dom-selection";
import { afterEach, describe, expect, it } from "vite-plus/test";

describe("dom-selection", () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.getSelection()?.removeAllRanges();
  });

  it("DOM が差し替わった後も root 内の文字選択を同じ位置へ戻す", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<article><header>1 名前</header><div class="res__body">選択する本文です</div></article>';
    document.body.append(root);

    const text = root.querySelector(".res__body")?.firstChild;
    expect(text).toBeInstanceOf(Text);

    const selection = document.getSelection();
    const range = document.createRange();
    range.setStart(text!, 0);
    range.setEnd(text!, 5);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const snapshot = captureRootSelection(root);
    expect(snapshot).not.toBeNull();
    expect(selection?.toString()).toBe("選択する本");

    root.innerHTML =
      '<article><header>1 名前</header><div class="res__body">選択する本文です</div></article>';
    expect(selection?.toString()).toBe("");

    expect(restoreRootSelection(root, snapshot)).toBe(true);
    expect(selection?.toString()).toBe("選択する本");
  });

  it("DOM 側で選択が維持されている場合は現在の選択を変更しない", () => {
    const root = document.createElement("div");
    root.textContent = "現在の選択";
    document.body.append(root);
    const text = root.firstChild!;
    const selection = document.getSelection();
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 2);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const snapshot = captureRootSelection(root);
    expect(restoreRootSelection(root, snapshot)).toBe(false);
    expect(selection?.toString()).toBe("現在");
  });
});
