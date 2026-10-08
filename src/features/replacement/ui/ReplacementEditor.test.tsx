import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ReplacementEditor } from "./ReplacementEditor";

afterEach(cleanup);

describe("置換ルールの編集と診断", () => {
  it("位置付き診断を表示し、修正すると診断を消す", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReplacementEditor value={'replace body:\n  from "a"\n  to bare'} onChange={onChange} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("3行3列");
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
