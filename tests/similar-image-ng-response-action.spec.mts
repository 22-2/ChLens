import { test } from "./fixtures.mjs";
import { verifySimilarImageNgResponseAction } from "./similar-image-ng-scenarios.mjs";

test("類似画像NGを非表示にすると、似た画像を含むレスだけを隠す", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "off");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await verifySimilarImageNgResponseAction(page, localBoard, "hide");
});

test("類似画像NGを折りたたむにすると、似た画像を含むレスだけを折りたたむ", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "off");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await verifySimilarImageNgResponseAction(page, localBoard, "collapse");
});
