import { getEventTargetElement } from "src/view/browser/utils/dom";
import { describe, expect, it } from "vite-plus/test";

describe("dom", () => {
  it("Elementのtargetをそのまま返す", () => {
    const element = document.createElement("button");

    expect(getEventTargetElement(element)).toBe(element);
  });

  it("Text nodeのtargetは親Elementへ正規化する", () => {
    const parent = document.createElement("div");
    const text = document.createTextNode("text");
    parent.appendChild(text);

    expect(getEventTargetElement(text)).toBe(parent);
  });

  it("ElementやNodeでないtargetはnullにする", () => {
    expect(getEventTargetElement(null)).toBeNull();
    expect(getEventTargetElement(window)).toBeNull();
  });
});
