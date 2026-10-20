import type { Page } from "@playwright/test";

import { expect } from "./fixtures.mjs";

/** 表示領域の上端にかかっているレスと、その上端が表示領域の上端からどれだけずれているか。 */
export interface ViewportAnchor {
  resNum: number;
  offset: number;
}

interface ThreadDebugState {
  tabId: string;
  threadUrl: string;
  isActive: boolean;
  loading: boolean;
  responseCount: number;
}

const ACTIVE_PANEL = '.content-area__tab-panel[data-active="true"]';

/** URL入力からローカル板を開き、スレ一覧のタイトルを押してスレッドを表示する。 */
export async function openThreadFromBoard(
  page: Page,
  extensionId: string,
  boardUrl: string,
  title: string,
) {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  const urlInput = page.getByPlaceholder("URLを入力");
  await urlInput.fill(boardUrl);
  await urlInput.press("Enter");
  await page.locator(ACTIVE_PANEL).getByText(title, { exact: true }).click();
}

/**
 * 表示中のスレッドがレスを全部受け取り、読み込みを終えるまで待つ。
 *
 * 仮想スクロールでは全レスがDOMに並ばないため、DOMの数ではなく
 * デバッグAPIが公開する画面の状態で判定する。
 */
export async function waitForThreadLoaded(
  page: Page,
  threadUrl: string,
  responseCount: number,
  timeout?: number,
) {
  await expect
    .poll(
      async () => {
        const state = await readActiveThreadState(page, threadUrl);
        return state != null && !state.loading ? state.responseCount : -1;
      },
      { timeout },
    )
    .toBe(responseCount);
}

async function readActiveThreadState(
  page: Page,
  threadUrl: string,
): Promise<ThreadDebugState | null> {
  return page.evaluate((url) => {
    const states = (
      window as typeof window & { __chlensDebug?: { state: () => Record<string, unknown> } }
    ).__chlensDebug?.state();
    if (!states) return null;
    for (const [key, value] of Object.entries(states)) {
      if (!key.startsWith("thread:")) continue;
      const state = value as ThreadDebugState;
      if (state.isActive && state.threadUrl === url) return state;
    }
    return null;
  }, threadUrl);
}

/** 表示中のタブのスクロール位置を、全体の高さに対する割合で設定する。 */
export async function scrollActivePanelToRatio(page: Page, ratio: number) {
  await page.locator(ACTIVE_PANEL).evaluate((panel, value) => {
    panel.scrollTop = (panel.scrollHeight - panel.clientHeight) * value;
  }, ratio);
  await waitForScrollSettled(page);
}

/** スクロール位置が2フレーム続けて変わらなくなるまで待つ（補正や遅延描画の完了待ち）。 */
export async function waitForScrollSettled(page: Page) {
  await page.locator(ACTIVE_PANEL).evaluate(
    (panel) =>
      new Promise<void>((resolve) => {
        let previous = Number.NaN;
        let stableFrames = 0;
        const check = () => {
          const current = panel.scrollTop;
          stableFrames = current === previous ? stableFrames + 1 : 0;
          previous = current;
          if (stableFrames >= 2) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
}

export async function readViewportAnchor(page: Page): Promise<ViewportAnchor | null> {
  return page.locator(ACTIVE_PANEL).evaluate((panel) => {
    const panelTop = panel.getBoundingClientRect().top;
    const items = panel.querySelectorAll<HTMLElement>(".thread-page__responses [data-res-num]");
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      // ジャンプ直後は直前のレスの下端が小数の丸めで上端に1px未満だけ残るため、それは見えていない扱いにする。
      if (rect.bottom <= panelTop + 1) continue;
      return {
        resNum: Number.parseInt(item.dataset.resNum ?? "", 10),
        offset: Math.round(rect.top - panelTop),
      };
    }
    return null;
  });
}

/** アンカーが同じレスで、ずれ量が許容範囲内に収まるまで待つ。 */
export async function expectViewportAnchor(page: Page, expected: ViewportAnchor, tolerance = 1) {
  await expect
    .poll(async () => {
      const actual = await readViewportAnchor(page);
      if (!actual || actual.resNum !== expected.resNum) return actual;
      return Math.abs(actual.offset - expected.offset) <= tolerance ? expected : actual;
    })
    .toEqual(expected);
}

/**
 * コマンドパレットの「レスNへジャンプ」から移動する。
 * アプリ自身の移動経路を使うため、飛び先がDOM上にない仮想化後も同じ手順で検証できる。
 */
export async function jumpToResponse(page: Page, resNum: number) {
  await runPaletteCommand(page, String(resNum), new RegExp(`^レス${resNum}へジャンプ`, "u"));
}

/**
 * コマンドパレットを開き、入力に対して出た候補を選ぶ。
 *
 * コマンドモードは入力欄の先頭に「>」が付く。開いた直後はアプリが「>」を入れる処理と
 * テストの入力が前後することがあり、「>>…」になって候補が出ないため、値と候補が
 * そろうまで入力し直す。
 */
export async function runPaletteCommand(page: Page, input: string, option: RegExp) {
  await page.keyboard.press("ControlOrMeta+Shift+P");
  const commandInput = page.getByPlaceholder("コマンドを検索...");
  const optionLocator = page.getByRole("option", { name: option });
  await expect(async () => {
    await commandInput.fill(`>${input}`);
    await expect(commandInput).toHaveValue(`>${input}`, { timeout: 1000 });
    await expect(optionLocator).toBeVisible({ timeout: 1000 });
  }).toPass();
  await optionLocator.click();
}

interface VirtualListDebugState {
  corrections: number;
  lastCorrectionDelta: number;
  measuredCount: number;
  estimatedCount: number;
  renderedKeys: Array<number | string>;
  itemCount: number;
}

interface MinimapDebugState {
  scrollTop: number;
  totalSize: number;
  clientHeight: number;
  frameHeight: number;
  responseTotal: number;
  viewportTopOrdinal: number;
  viewportBottomOrdinal: number;
  markers: { resNum: number; x: number; y: number }[];
}

/** ミニマップの表示領域枠が、レス順位でどこからどこまでを指しているかを読む。 */
export async function readMinimapState(page: Page): Promise<MinimapDebugState | null> {
  return page.evaluate(() => {
    const states = (
      window as typeof window & { __chlensDebug?: { state: () => Record<string, unknown> } }
    ).__chlensDebug?.state();
    if (!states) return null;
    const entry = Object.entries(states).find(([key]) => key.startsWith("thread-minimap:"));
    return (entry?.[1] as MinimapDebugState | undefined) ?? null;
  });
}

/** 仮想リストのデバッグ状態（補正の回数、描画中のレスなど）を読む。表示中のタブが1つの前提。 */
export async function readVirtualListState(page: Page): Promise<VirtualListDebugState | null> {
  return page.evaluate(() => {
    const states = (
      window as typeof window & { __chlensDebug?: { state: () => Record<string, unknown> } }
    ).__chlensDebug?.state();
    if (!states) return null;
    const entry = Object.entries(states).find(([key]) => key.startsWith("virtual-list:"));
    return (entry?.[1] as VirtualListDebugState | undefined) ?? null;
  });
}
