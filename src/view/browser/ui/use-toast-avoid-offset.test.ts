import {
  measureToastAvoidBottom,
  TOAST_AVOID_ATTRIBUTE,
} from "src/view/browser/ui/use-toast-avoid-offset";
import { afterEach, describe, expect, it } from "vite-plus/test";

function addAvoidElement(bottom: number, height = 40): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute(TOAST_AVOID_ATTRIBUTE, "");
  element.getBoundingClientRect = () =>
    ({ top: bottom - height, bottom, height, width: 300 }) as DOMRect;
  document.body.append(element);
  return element;
}

describe("measureToastAvoidBottom", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("避け対象がなければ0を返す", () => {
    expect(measureToastAvoidBottom(document)).toBe(0);
  });

  it("複数の避け対象のうち最も下の端に余白を足して返す", () => {
    addAvoidElement(60);
    addAvoidElement(120);
    expect(measureToastAvoidBottom(document)).toBe(128);
  });

  it("高さが0の非表示領域は無視する", () => {
    addAvoidElement(200, 0);
    expect(measureToastAvoidBottom(document)).toBe(0);
  });
});
