import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ReplacementEditor } from "./ReplacementEditor";

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
    options,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: { ariaLabel: string };
  }) => (
    <textarea
      aria-label={options.ariaLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
  loader: { config: vi.fn() },
  useMonaco: () => null,
}));
vi.mock("src/view/browser/hooks/use-theme", () => ({ useTheme: () => "light" }));
// 実際のMonacoはブラウザ専用なので、遅延初期化後の画面操作をテストする。
vi.mock("src/view/browser/ui/monacoDslRuntime", () => ({
  initializeDslMonaco: async () => ({
    languages: { getLanguages: () => [{ id: "replacement-dsl" }] },
    editor: { setTheme: vi.fn() },
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("置換ルールの編集と診断", () => {
  it("位置付き診断を表示し、修正すると診断を消す", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReplacementEditor value={'replace body:\n  from "a"\n  to bare'} onChange={onChange} />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("3行3列");
    fireEvent.change(screen.getByLabelText("置換ルール"), {
      target: { value: 'replace body:\n  from "a"\n  to "b"' },
    });
    expect(onChange).toHaveBeenCalledWith('replace body:\n  from "a"\n  to "b"');
    rerender(
      <ReplacementEditor value={'replace body:\n  from "a"\n  to "b"'} onChange={onChange} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
