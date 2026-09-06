import { chromium } from "@playwright/test";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: false,
  args: ["--no-first-run", "--no-default-browser-check"],
});
const context = await browser.newContext();
await context.addInitScript(() => {
  const listeners = new Set();
  const onMessage = {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    hasListener: (fn) => listeners.has(fn),
  };
  window.chrome = {
    runtime: {
      id: "stub-extension",
      onMessage,
      getManifest: () => ({ version: "4.0.0" }),
      sendMessage: async () => ({}),
      lastError: undefined,
    },
  };
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:8000/view/index.html");
await page.locator(".browser-shell").waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);

const hamburger = page.locator('[title="メニュー"]').first();
const menuItem = () =>
  page
    .getByRole("button", { name: "コマンドパレット" })
    .isVisible()
    .catch(() => false);

// 人間相当の間隔で2回押す: 開く→閉じる
await hamburger.click();
await page.waitForTimeout(600);
console.log("open after 1st click:", await menuItem());
await hamburger.click();
await page.waitForTimeout(400);
const afterSecond = await menuItem();
console.log("open after 2nd click (expect false):", afterSecond);

// 3回目でまた開くこと
await hamburger.click();
await page.waitForTimeout(400);
console.log("open after 3rd click (expect true):", await menuItem());

await page.screenshot({
  path: "C:\\Users\\17890\\AppData\\Local\\Temp\\opencode\\repro107toggle.png",
});
console.log(afterSecond ? "BUG STILL PRESENT" : "OK: toggle closes");
await browser.close();
process.exit(afterSecond ? 1 : 0);
