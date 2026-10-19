import "@testing-library/jest-dom/vitest";

import { render } from "preact";
import { act } from "preact/test-utils";
import { useEffect, useState } from "react";
import { StatusBar, StatusBarItem, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// 単体テストは通常 React で動くが、このリークは Preact の VNode の扱いでだけ起きる。
// 本番ビルドと同じく react 系の import を Preact へ差し替えて検査する。
vi.mock("react", () => import("preact/compat"));
vi.mock("react-dom", () => import("preact/compat"));
vi.mock("react/jsx-runtime", () => import("preact/jsx-runtime"));
vi.mock("react/jsx-dev-runtime", () => import("preact/jsx-runtime"));

type SetTick = (tick: number) => void;

/** App のペインと同じく、本文・項目登録・StatusBar を一つの Fragment に並べて再描画する。 */
function Pane({ onReady }: { onReady: (setTick: SetTick) => void }) {
  const [tick, setTick] = useState(0);
  // 描画中に外部へ書き出すと副作用になるため、描画後に更新関数を渡す。
  useEffect(() => onReady(setTick), [onReady, setTick]);
  return (
    <StatusBarProvider>
      <>
        {Array.from({ length: 10 }, (_, index) => (
          <p key={index}>{`${index}:${tick}`}</p>
        ))}
        <StatusBarItem id="count">
          <button type="button">{`${tick}件`}</button>
        </StatusBarItem>
        <StatusBar />
      </>
    </StatusBarProvider>
  );
}

/** DOMとその独自プロパティから到達できるVNodeを数え、描画ライブラリ内部の名前に依存せず保持量を比べる。 */
function countReachableVNodes(root: Node): number {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  let count = 0;
  while (stack.length > 0) {
    const value = stack.pop();
    if (value == null || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if ("type" in value && "props" in value) count++;
    if (value instanceof Node) stack.push(...Array.from(value.childNodes));
    for (const key of Object.keys(value)) stack.push((value as Record<string, unknown>)[key]);
  }
  return count;
}

describe("StatusBar（Preact）", () => {
  let container: HTMLDivElement;

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it("ペインの再描画と表示内容の更新を繰り返しても古い描画ツリーを保持し続けない", async () => {
    // 回帰防止: 以前は登録されたJSXをstateに保存していた。Preactは初回描画したJSX要素へ親VNodeへの
    // 参照を書き込むため、ペインの再描画とレス数表示の更新が重なるたびに古い描画ツリーが連鎖して残った。
    container = document.createElement("div");
    document.body.append(container);
    let setTick: SetTick = () => {};
    await act(() =>
      render(
        <Pane
          onReady={(next) => {
            setTick = next;
          }}
        />,
        container,
      ),
    );
    for (let tick = 1; tick <= 5; tick++) await act(() => setTick(tick));
    const afterFewUpdates = countReachableVNodes(container);
    for (let tick = 6; tick <= 50; tick++) await act(() => setTick(tick));

    expect(container.querySelector(".status-bar")).toHaveTextContent("50件");
    expect(countReachableVNodes(container)).toBe(afterFewUpdates);
  });
});
