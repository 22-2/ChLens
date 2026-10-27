import { verifySimilarImageNgRegistration } from "../similar-image-ng-scenarios.mjs";
import { test } from "./fixtures.mjs";

// Tauriのページは画像と別オリジンでcanvasから読めないため、Rust側HTTPで取り直してハッシュを求める経路を通る。
test("画像の右クリックから類似画像NGに登録すると、似た画像のサムネイルだけをぼかす", async ({
  page,
  localBoard,
}) => {
  // 既定の画像取得は手動（クリックで取得）のため、自動取得を前提にするこの検証では明示的にoffにする。
  await page.evaluate(() => localStorage.setItem("config_manual_image_loading", "off"));
  await page.reload();
  await verifySimilarImageNgRegistration(page, localBoard);
});
