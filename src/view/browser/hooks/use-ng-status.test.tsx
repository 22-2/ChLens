import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { NgStatusProvider, useNgDisplayMode } from "src/view/browser/hooks/use-ng-status";
import { NG_DISPLAY_CONFIG_KEY } from "src/view/browser/utils/ng-display-mode";

const mocks = vi.hoisted(() => ({
  configValue: "soft-ng",
  configUpdatedCallback: undefined as ((data: { key?: string }) => void) | undefined,
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) => (key === "display_ng" ? mocks.configValue : null),
      ready: (callback: () => void) => callback(),
    },
    message: {
      on: (_type: string, callback: (data: { key?: string }) => void) => {
        mocks.configUpdatedCallback = callback;
      },
      off: () => {},
    },
  },
}));

afterEach(() => {
  cleanup();
  mocks.configValue = "soft-ng";
  mocks.configUpdatedCallback = undefined;
});

function NgDisplayProbe() {
  return <span>{useNgDisplayMode()}</span>;
}

describe("use-ng-statusのNG表示方式同期", () => {
  it("設定値を初期表示へ反映する", () => {
    mocks.configValue = "highlight-ng";

    render(
      <NgStatusProvider>
        <NgDisplayProbe />
      </NgStatusProvider>,
    );

    expect(screen.getByText("highlight-ng")).toBeInTheDocument();
  });

  it("display_ngの変更をプロバイダ配下へ反映する", () => {
    render(
      <NgStatusProvider>
        <NgDisplayProbe />
      </NgStatusProvider>,
    );

    expect(screen.getByText("soft-ng")).toBeInTheDocument();

    mocks.configValue = "hard-ng";
    act(() => {
      mocks.configUpdatedCallback?.({ key: NG_DISPLAY_CONFIG_KEY });
    });

    expect(screen.getByText("hard-ng")).toBeInTheDocument();
  });
});
