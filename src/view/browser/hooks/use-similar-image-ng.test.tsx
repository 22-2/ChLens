import "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import type { Rule } from "@chlen/ch-lib";
import type { IRes } from "src/service-container/interfaces";
import { useSimilarImageNg } from "src/view/browser/hooks/use-similar-image-ng";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  checkSimilarImages: vi.fn(),
  rules: [] as Rule[],
}));

vi.mock("src/service-container/index", () => ({
  container: {
    message: {
      on: vi.fn(),
      off: vi.fn(),
    },
    ng: {
      getSimilarImageRules: () => mocks.rules,
    },
  },
}));

vi.mock("src/view/browser/utils/similar-image-ng", async () => {
  const actual = await vi.importActual<typeof import("src/view/browser/utils/similar-image-ng")>(
    "src/view/browser/utils/similar-image-ng",
  );
  return {
    ...actual,
    checkSimilarImages: mocks.checkSimilarImages,
  };
});

interface TestIntersectionObserver {
  observed: HTMLElement[];
  trigger(element: HTMLElement, isIntersecting?: boolean): void;
}

let observers: TestIntersectionObserver[] = [];

class IntersectionObserverStub implements TestIntersectionObserver {
  readonly observed: HTMLElement[] = [];
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe(element: Element): void {
    if (element instanceof HTMLElement) this.observed.push(element);
  }

  unobserve(): void {}

  disconnect(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(element: HTMLElement, isIntersecting = true): void {
    this.callback(
      [{ target: element, isIntersecting } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

interface SimilarImageHarnessProps {
  responses: readonly IRes[];
  children?: ReactNode;
}

function SimilarImageHarness({ responses, children }: SimilarImageHarnessProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // テスト対象hookは、ThreadPageと同じrootRefを使ってレスDOMを監視する。
  const blurredResNums = useSimilarImageNg(responses, rootRef, {
    threadUrl: "https://example.com/test/read.cgi/board/1",
  });

  return (
    <div ref={rootRef}>
      {responses.map((res) => (
        <article key={res.num} data-res-num={res.num}>
          {res.message}
        </article>
      ))}
      <output data-testid="blurred">{Array.from(blurredResNums).join(",") || "none"}</output>
      {children}
    </div>
  );
}

const IMAGE_RES: IRes = {
  num: 1,
  name: "名無しさん",
  mail: "",
  date: "2026/09/05",
  message: "https://example.com/image.jpg",
};

beforeEach(() => {
  observers = [];
  mocks.rules = [
    {
      action: "blur",
      target: "similar-image",
      enabled: true,
      matchers: [{ kind: "contains", value: "0123456789abcdef" }],
    },
  ];
  mocks.checkSimilarImages.mockReset();
  mocks.checkSimilarImages.mockResolvedValue(true);
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSimilarImageNg", () => {
  it("表示付近に入った画像レスだけを一度評価してぼかし対象にする", async () => {
    render(<SimilarImageHarness responses={[IMAGE_RES]} />);

    expect(observers).toHaveLength(1);
    expect(observers[0]?.observed).toHaveLength(1);
    const responseElement = observers[0]?.observed[0];
    expect(responseElement).toBeDefined();

    observers[0]?.trigger(responseElement!);
    observers[0]?.trigger(responseElement!);

    await waitFor(() =>
      expect(document.querySelector("[data-testid=blurred]")).toHaveTextContent("1"),
    );
    expect(mocks.checkSimilarImages).toHaveBeenCalledTimes(1);
    expect(mocks.checkSimilarImages).toHaveBeenCalledWith(
      ["https://example.com/image.jpg"],
      expect.arrayContaining([expect.objectContaining({ threshold: 10 })]),
    );
  });

  it("image_blurが無効ならObserverを登録しない", () => {
    function DisabledHarness() {
      const rootRef = useRef<HTMLDivElement>(null);
      const blurredResNums = useSimilarImageNg([IMAGE_RES], rootRef, { enabled: false });
      return <div ref={rootRef}>{blurredResNums.size}</div>;
    }

    render(<DisabledHarness />);

    expect(observers).toHaveLength(0);
    expect(mocks.checkSimilarImages).not.toHaveBeenCalled();
  });
});
