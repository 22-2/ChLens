import { render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { describe, expect, it } from "vite-plus/test";

function Probe({ value, seen }: { value: string; seen: string[] }) {
  const ref = useLatestRef(value);
  // 後続の layout effect から、同じ commit の最新値が見えることを確かめる。
  useLayoutEffect(() => {
    seen.push(ref.current);
  });
  return null;
}

describe("useLatestRef", () => {
  it("同じ commit の後続 layout effect から最新値を読める", () => {
    const seen: string[] = [];
    const { rerender } = render(<Probe value="a" seen={seen} />);
    rerender(<Probe value="b" seen={seen} />);
    expect(seen).toEqual(["a", "b"]);
  });

  it("再描画をまたいで同じ ref を返す", () => {
    const refs: unknown[] = [];
    function Collector({ value }: { value: number }) {
      refs.push(useLatestRef(value));
      return null;
    }
    const { rerender } = render(<Collector value={1} />);
    rerender(<Collector value={2} />);
    expect(refs[0]).toBe(refs[1]);
  });
});
