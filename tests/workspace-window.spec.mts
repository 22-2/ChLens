import { expect, test } from "./fixtures.mjs";

test("別窓に複数のタブを開き、本窓の再読み込み後に別窓を同じ構成で復元する", async ({
  page,
  extensionId,
  localBoard,
}) => {
  const second = localBoard.addLargeThread(3, { id: "1000000002", title: "復元するスレ" });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByTestId("title-bar-title").click({ button: "right" });
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "別窓で開く", exact: true }).click(),
  ]);
  await expect(popup.getByRole("tab")).toHaveCount(1);
  await expect(popup.getByRole("button", { name: /サイドパネルを(?:開く|閉じる)/u })).toHaveCount(
    0,
  );
  await popup.keyboard.press("Control+Shift+P");
  await expect(popup.getByPlaceholder("コマンドを検索...")).toBeVisible();
  await expect(page.getByPlaceholder("コマンドを検索...")).toHaveCount(0);
  await popup.keyboard.press("Escape");
  await popup.getByRole("button", { name: "新しいタブ", exact: true }).click();
  await expect(popup.getByRole("tab")).toHaveCount(2);
  await popup.getByTestId("title-bar-title").click();
  await popup.getByPlaceholder("URLを入力").fill(second.threadUrl);
  await popup.getByPlaceholder("URLを入力").press("Enter");
  await expect(popup.getByTestId("title-bar-title")).toHaveText(second.title);
  const [restored] = await Promise.all([page.context().waitForEvent("page"), page.reload()]);
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(restored.getByRole("tab", { name: /復元するスレ/ })).toBeVisible();
  await expect(restored.getByRole("tab", { name: /ローカルテストスレッド/ })).toBeVisible();
  // 本窓には別窓のタブが混ざらない。
  await expect(page.getByRole("tab", { name: /復元するスレ/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /ローカルテストスレッド/ })).toHaveCount(0);
});

test("OSで別窓を閉じると窓内のタブを閉じた履歴から開き直せる", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByTestId("title-bar-title").click({ button: "right" });
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "別窓で開く", exact: true }).click(),
  ]);
  await expect(popup.locator('[data-res-num="2"]')).toBeVisible();
  await popup.close();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("chlens_browser_session") || "{}").closedTabs?.length ||
          0,
      ),
    )
    .toBeGreaterThan(0);
  await page.locator(".tab-bar").dispatchEvent("contextmenu", { clientX: 20, clientY: 20 });
  await page.getByRole("button", { name: "閉じたタブを開く", exact: true }).click();
  await expect(page.getByTestId("title-bar-title")).toHaveText("ローカルテストスレッド");
});

test("別窓の最後のタブを閉じると窓も閉じる", async ({ page, extensionId, localBoard }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByTestId("title-bar-title").click({ button: "right" });
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "別窓で開く", exact: true }).click(),
  ]);
  await popup.getByTitle("タブを閉じる", { exact: true }).click();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("chlens_browser_session") || "{}").closedTabs?.length ||
          0,
      ),
    )
    .toBe(1);
});

test("タブのメニューとコマンドパレットで本窓と別窓の間を移動できる", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByTestId("title-bar-title").click({ button: "right" });
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "別窓で開く", exact: true }).click(),
  ]);
  await expect(popup.locator('[data-res-num="2"]')).toBeVisible();

  // 本窓に残ったホームのタブを、メニューから別窓へ移す。
  await page.getByRole("tab").first().click({ button: "right" });
  await page.getByRole("button", { name: "別窓1へ移動", exact: true }).click();
  await expect(popup.getByRole("tab")).toHaveCount(2);

  // 別窓の選択タブを、コマンドパレットから本窓へ戻す。
  await popup.keyboard.press("Control+Shift+P");
  await popup.getByPlaceholder("コマンドを検索...").pressSequentially("次のペイン");
  await popup.getByText("次のペイン・窓へ移動", { exact: true }).click();
  await expect(popup.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("タブを窓の外までドラッグすると新しい窓へ移る", async ({ page, extensionId, localBoard }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByTestId("title-bar-title").click();
  await page.getByPlaceholder("URLを入力").fill(localBoard.threadUrl);
  await page.getByPlaceholder("URLを入力").press("Enter");
  await expect(page.locator('[data-res-num="2"]')).toBeVisible();
  await page.getByRole("button", { name: "新しいタブ", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);

  const threadTab = page.getByRole("tab", { name: /ローカルテストスレッド/ });
  const box = (await threadTab.boundingBox())!;
  const viewport = page.viewportSize()!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // 距離の判定を越えてから、表示領域の外へ段階的に動かす。
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.move(viewport.width / 2, viewport.height + 200, { steps: 10 });
  const [popup] = await Promise.all([page.context().waitForEvent("page"), page.mouse.up()]);

  await expect(popup.locator('[data-res-num="2"]')).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("同じ窓のペイン端へタブをドラッグして分割する", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByRole("button", { name: "新しいタブ", exact: true }).click();
  const tab = page.getByRole("tab").first();
  const tabBox = (await tab.boundingBox())!;
  const paneBox = (await page.locator("[data-workspace-pane-id]").first().boundingBox())!;
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabBox.x + tabBox.width / 2 + 20, tabBox.y + tabBox.height / 2 + 20, {
    steps: 5,
  });
  await page.mouse.move(paneBox.x + paneBox.width * 0.9, paneBox.y + paneBox.height / 2, {
    steps: 10,
  });
  await expect(page.locator(".workspace-tab-drop-preview")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("[data-workspace-pane-id]")).toHaveCount(2);
  await expect(page.locator(".workspace-tab-drop-preview")).toHaveCount(0);
});

test("別窓内でタブをドラッグして分割した後も操作できる", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await page.getByRole("tab").first().click({ button: "right" });
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("button", { name: "別窓で開く", exact: true }).click(),
  ]);
  await popup.getByRole("button", { name: "新しいタブ", exact: true }).click();
  const tab = popup.getByRole("tab").first();
  const tabBox = (await tab.boundingBox())!;
  const paneBox = (await popup.locator("[data-workspace-pane-id]").first().boundingBox())!;
  await popup.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await popup.mouse.down();
  await popup.mouse.move(tabBox.x + tabBox.width / 2 + 20, tabBox.y + tabBox.height / 2 + 20, {
    steps: 5,
  });
  await popup.mouse.move(paneBox.x + paneBox.width * 0.9, paneBox.y + paneBox.height / 2, {
    steps: 10,
  });
  await expect(popup.locator(".workspace-tab-drop-preview")).toBeVisible();
  await popup.mouse.up();
  await expect(popup.locator("[data-workspace-pane-id]")).toHaveCount(2);
  await popup.getByRole("tab").last().click();
  await expect(popup.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
});
