import { expect, test } from "./fixtures.mjs";

test("ペインの最後のタブを反対側へドラッグして分割を解除する", async ({ page, extensionId }) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_tab_bar_orientation", "vertical");
    localStorage.setItem("config_tab_bar_collapsed", "off");
  });
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
  await page.mouse.up();
  await expect(page.locator("[data-workspace-pane-id]")).toHaveCount(2);

  const sections = page.locator(".tab-bar__pane-section");
  const source = sections.nth(1).getByRole("tab").first();
  const target = sections.nth(0).getByRole("tab").first();
  const sourceBox = (await source.boundingBox())!;
  const targetBox = (await target.boundingBox())!;
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 15,
    sourceBox.y + sourceBox.height / 2 + 15,
    { steps: 5 },
  );
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.locator("[data-workspace-pane-id]")).toHaveCount(1);
  const positions = await page
    .locator(".tab-list > .tab, .tab-list > .tab-bar__add")
    .evaluateAll((items) =>
      items.map((item) => ({
        add: item.classList.contains("tab-bar__add"),
        top: item.getBoundingClientRect().top,
      })),
    );
  expect(positions.find((item) => item.add)!.top).toBeGreaterThan(
    Math.max(...positions.filter((item) => !item.add).map((item) => item.top)),
  );

  // 分割を作り直し、右クリックからも全タブを残して統合できることを確かめる。
  const nextSource = page.getByRole("tab").first();
  const nextBox = (await nextSource.boundingBox())!;
  const nextPaneBox = (await page.locator("[data-workspace-pane-id]").first().boundingBox())!;
  await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(nextBox.x + nextBox.width / 2 + 20, nextBox.y + nextBox.height / 2 + 20, {
    steps: 5,
  });
  await page.mouse.move(
    nextPaneBox.x + nextPaneBox.width * 0.9,
    nextPaneBox.y + nextPaneBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(page.locator("[data-workspace-pane-id]")).toHaveCount(2);
  await page.getByRole("tab").last().click({ button: "right" });
  await page.getByRole("button", { name: "ペインの分割を解除" }).click();
  await expect(page.locator("[data-workspace-pane-id]")).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveCount(2);
});
