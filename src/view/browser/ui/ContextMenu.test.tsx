import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu } from "src/view/browser/ui/ContextMenu";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(cleanup);

it("チェック項目の状態を伝え、選択できる", async () => {
  const onSelect = vi.fn();
  render(
    <ContextMenu
      x={10}
      y={10}
      onClose={vi.fn()}
      enableKeyboardNavigation
      items={[
        { id: "visible", label: "板一覧", checked: true, onSelect },
        { id: "hidden", label: "画像一覧", checked: false },
      ]}
    />,
  );
  const item = await screen.findByRole("menuitemcheckbox", { name: "板一覧", checked: true });
  expect(
    screen.getByRole("menuitemcheckbox", { name: "画像一覧", checked: false }),
  ).toBeInTheDocument();
  fireEvent.click(item);
  expect(onSelect).toHaveBeenCalledOnce();
});

it("アクセスキーで対応する項目だけを実行する", async () => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <ContextMenu
      x={10}
      y={10}
      onClose={onClose}
      items={[
        { id: "open", label: "新しいタブで開く", accessKey: "t", onSelect },
        { id: "disabled", label: "無効", accessKey: "e", disabled: true, onSelect },
      ]}
    />,
  );
  const menu = await screen.findByRole("menu");
  fireEvent.keyDown(menu, { key: "e" });
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.keyDown(menu, { key: "T" });
  expect(onSelect).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});
