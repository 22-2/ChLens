import { test } from "./fixtures.mjs";
import { verifySimilarImageNgRegistration } from "./similar-image-ng-scenarios.mjs";

test("画像の右クリックから類似画像NGに登録すると、似た画像のサムネイルだけをぼかす", async ({
  page,
  extensionId,
  localBoard,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("config_manual_image_loading", "off");
  });
  await page.goto(`chrome-extension://${extensionId}/view/index.html`);
  await verifySimilarImageNgRegistration(page, localBoard);
});
