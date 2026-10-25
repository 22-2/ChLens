import "@testing-library/jest-dom/vitest";

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { requestExternalLink } from "./external-link";

const state = vi.hoisted(() => ({ enabled: true, sync: () => {} }));
vi.mock("src/view/browser/utils/config-setting", () => ({
  readConfigValue: () => (state.enabled ? "on" : "off"),
  subscribeConfigKeys: (_keys: string[], sync: () => void) => {
    state.sync = sync;
    return () => {};
  },
}));
vi.mock("src/app/platform/index", () => ({ platform: { window: {} } }));

beforeEach(() => {
  state.enabled = true;
});
afterEach(() => {
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
});

describe("外部リンクを承認してから開く", () => {
  it("承認前とキャンセル後には一度も外部起動しない", async () => {
    const open = vi.fn();
    act(() => requestExternalLink("https://example.com/?utm_source=test", { open }));
    const cancel = await screen.findByRole("button", { name: "キャンセル" });
    expect(cancel).toHaveFocus();
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("選択した除去後URLだけを一度開く", async () => {
    const open = vi.fn();
    act(() => requestExternalLink("https://example.com/article?id=42&utm_source=test", { open }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^開く$/ }));
    expect(open).toHaveBeenCalledOnce();
    expect(new URL(open.mock.calls[0][0]).search).toBe("?id=42");
  });
  it("OFFではモーダルもURL変更も行わない", () => {
    state.enabled = false;
    const open = vi.fn();
    requestExternalLink("https://example.com/?utm_source=test", { open });
    expect(open).toHaveBeenCalledWith("https://example.com/?utm_source=test");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("設定をOFFへ変えると確認を閉じ、リンクを開かない", async () => {
    const open = vi.fn();
    act(() => requestExternalLink("https://example.com/", { open }));
    await screen.findByRole("dialog");
    state.enabled = false;
    act(() => state.sync());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
  it("連打で古い確認を残さず、最後の要求だけを承認する", async () => {
    const first = vi.fn();
    const second = vi.fn();
    act(() => requestExternalLink("https://example.com/first", { open: first }));
    await screen.findByRole("dialog");
    act(() => requestExternalLink("https://example.com/second", { open: second }));
    await waitFor(() =>
      expect(screen.getByRole("textbox")).toHaveValue("https://example.com/second"),
    );
    fireEvent.click(screen.getByRole("button", { name: /^開く$/ }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("https://example.com/second");
  });
});
