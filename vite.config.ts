import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs-extra";
import * as sass from "sass";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import pug from "pug";
import sharp from "sharp";
import { glob } from "fs/promises";

// ─── helpers ────────────────────────────────────────────────────────────────

const imgExt = (browser: string) => (browser === "chrome" ? "webp" : "png");

function isSrcNewer(src: string, bin: string): boolean {
  const srcTime = fs.statSync(src).mtimeMs;
  try {
    return srcTime > fs.statSync(bin).mtimeMs;
  } catch {
    return true;
  }
}

// ─── plugin: SCSS ────────────────────────────────────────────────────────────

function scssPlugin(browser: string, outputDir: string): Plugin {
  const ext = imgExt(browser);
  const isFirefox = browser === "firefox";

  const sassFunctions = {
    "img($name)": (args: sass.Value[]) => {
      const name = (args[0] as sass.SassString).text;
      return new sass.SassString(`url(/img/${name}.${ext})`, { quotes: false });
    },
    "vals($name)": (args: sass.Value[]) => {
      const name = (args[0] as sass.SassString).text;
      let str = "";
      if (name === "scroll") {
        str = isFirefox ? "scroll" : "auto";
      }
      return new sass.SassString(str, { quotes: false });
    },
  };

  const pc = postcss([autoprefixer()]);

  async function buildScss(srcFile: string, destFile: string) {
    await fs.ensureDir(path.dirname(destFile));
    const result = sass.compile(srcFile, {
      style: "compressed",
      functions: sassFunctions,
    });
    const pcResult = await pc.process(result.css, { from: srcFile });
    await fs.writeFile(destFile, pcResult.css);
  }

  return {
    name: "scss-build",
    async buildStart() {
      const jobs: Array<[string, string]> = [
        // ui
        [path.resolve("src/ui/ui.scss"), `${outputDir}/ui.css`],
        // view
        ...(await Array.fromAsync(
          glob("src/view/*.scss"),
        )).map((f): [string, string] => [
          path.resolve(f),
          `${outputDir}/view/${path.basename(f, ".scss")}.css`,
        ]),
        // write
        ...(await Array.fromAsync(
          glob("src/write/*.scss"),
        )).filter(f => !path.basename(f).startsWith("_")).map((f): [string, string] => [
          path.resolve(f),
          `${outputDir}/write/${path.basename(f, ".scss")}.css`,
        ]),
      ];

      await Promise.all(jobs.map(([src, dest]) => buildScss(src, dest)));
    },
  };
}

// ─── plugin: Pug → HTML ──────────────────────────────────────────────────────

function pugPlugin(browser: string, outputDir: string): Plugin {
  const manifestJson = fs.readJsonSync("src/manifest.json");
  const locals = {
    ...manifestJson,
    image_ext: imgExt(browser),
  };

  async function buildPug(srcFile: string, destFile: string) {
    await fs.ensureDir(path.dirname(destFile));
    const html = pug.renderFile(srcFile, { ...locals, filename: srcFile });
    await fs.writeFile(destFile, html);
  }

  return {
    name: "pug-build",
    async buildStart() {
      const jobs: Array<[string, string]> = [];

      // view/*.pug (exclude _*.pug)
      for await (const f of glob("src/view/*.pug")) {
        if (path.basename(f).startsWith("_")) continue;
        jobs.push([
          path.resolve(f),
          `${outputDir}/view/${path.basename(f, ".pug")}.html`,
        ]);
      }

      // zombie.pug
      jobs.push([
        path.resolve("src/zombie.pug"),
        `${outputDir}/zombie.html`,
      ]);

      // write/*.pug (exclude _*.pug)
      for await (const f of glob("src/write/*.pug")) {
        if (path.basename(f).startsWith("_")) continue;
        jobs.push([
          path.resolve(f),
          `${outputDir}/write/${path.basename(f, ".pug")}.html`,
        ]);
      }

      await Promise.all(jobs.map(([src, dest]) => buildPug(src, dest)));
    },
  };
}

// ─── plugin: images ──────────────────────────────────────────────────────────

const IMG_LIST = [
  "read.crx_16x16.png",
  "read.crx_32x32.png",
  "read.crx_48x48.png",
  "read.crx_64x64.png",
  "close_16x16.webp",
  "dummy_1x1.webp",
  "lock_12x12_3a5.webp",
  "arrow_19x19_333_r90.webp",
  "arrow_19x19_333_r-90.webp",
  "search2_19x19_777.webp",
  "star_19x19_333.webp",
  "star_19x19_007fff.webp",
  "reload_19x19_333.webp",
  "pencil_19x19_333.webp",
  "menu_19x19_333.webp",
  "lock_19x19_182.webp",
  "unlock_19x19_333.webp",
  "pause_19x19_333.webp",
  "pause_19x19_811.webp",
  "regexp_19x19_333.webp",
  "regexp_19x19_06e.webp",
  "filter_19x19_333.webp",
  "arrow_19x19_ddd_r90.webp",
  "arrow_19x19_ddd_r-90.webp",
  "search2_19x19_aaa.webp",
  "star_19x19_ddd.webp",
  "star_19x19_f93.webp",
  "reload_19x19_ddd.webp",
  "pencil_19x19_ddd.webp",
  "menu_19x19_ddd.webp",
  "lock_19x19_3a5.webp",
  "unlock_19x19_ddd.webp",
  "pause_19x19_ddd.webp",
  "pause_19x19_a33.webp",
  "regexp_19x19_ddd.webp",
  "regexp_19x19_f93.webp",
  "filter_19x19_ddd.webp",
];

function imgPlugin(browser: string, outputDir: string): Plugin {
  const isChrome = browser === "chrome";
  const imgDir = `${outputDir}/img`;
  const svgDir = "src/image/svg";

  return {
    name: "img-build",
    async buildStart() {
      await fs.ensureDir(imgDir);

      const jobs: Promise<void>[] = [];

      // SVG → webp/png icons
      for (let img of IMG_LIST) {
        if (!isChrome) img = img.replace(".webp", ".png");
        const m = img.match(
          /^(.+)_(\d+)x(\d+)(?:_([a-fA-F0-9]*))?(?:_r(-?\d+))?\.(webp|png)$/,
        );
        if (!m) continue;
        const src = `${svgDir}/${m[1]}.svg`;
        const bin = `${imgDir}/${img}`;
        if (!isSrcNewer(src, bin)) continue;

        jobs.push((async () => {
          let data = await fs.readFile(src, "utf-8");
          if (m[4] != null) data = data.replace(/#333/g, `#${m[4]}`);
          const buf = Buffer.from(data, "utf8");
          let sh = sharp(buf);
          if (m[5] != null) sh = sh.rotate(parseInt(m[5]));
          sh = sh.resize(parseInt(m[2]), parseInt(m[3]));
          if (m[6] === "webp") sh = sh.webp({ lossless: true });
          await sh.toFile(bin);
        })());
      }

      // logo PNGs (96, 128)
      for (const size of [96, 128]) {
        const src = `${svgDir}/read.crx.svg`;
        const bin = `${imgDir}/read.crx_${size}x${size}.png`;
        if (!isSrcNewer(src, bin)) continue;
        const margin = size / 8;
        const inner = size - margin * 2;
        jobs.push(
          sharp(src)
            .resize(inner, inner)
            .extend({ top: margin, bottom: margin, left: margin, right: margin,
              background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFile(bin)
            .then(() => {}),
        );
      }

      // loading animation
      const loadingSrc = `${svgDir}/loading.svg`;
      const loadingBin = `${imgDir}/loading.${isChrome ? "webp" : "png"}`;
      if (isSrcNewer(loadingSrc, loadingBin)) {
        let sh = sharp(loadingSrc).resize(100, 100);
        if (isChrome) sh = sh.webp({ lossless: true });
        jobs.push(sh.toFile(loadingBin).then(() => {}));
      }

      await Promise.all(jobs);
    },
  };
}

// ─── plugin: manifest.json ───────────────────────────────────────────────────

function manifestPlugin(browser: string, outputDir: string): Plugin {
  return {
    name: "manifest-build",
    async buildStart() {
      if (browser === "tauri") return;
      await fs.ensureDir(outputDir);
      const m = await fs.readJson("src/manifest.json");

      if (browser === "chrome") {
        m.permissions = m.permissions.filter(
          (v: string) => !["webRequest", "webRequestBlocking"].includes(v),
        );
        delete m.background.scripts;
        delete m.applications;
      } else if (browser === "firefox") {
        m.manifest_version = 2;
        delete m.update_url;
        delete m.minimum_chrome_version;
        m.content_security_policy = m.content_security_policy.extension_pages;
        delete m.incognito;
        m.permissions = m.permissions.filter(
          (v: string) => !["declarativeNetRequest"].includes(v),
        );
        delete m.declarative_net_request;
        delete m.background.service_worker;
        m.permissions.push(...m.host_permissions);
        delete m.host_permissions;
        m.browser_action = m.action;
        delete m.action;
        m.web_accessible_resources = m.web_accessible_resources[0].resources;
      }

      await fs.writeJson(`${outputDir}/manifest.json`, m, { spaces: 2 });
    },
  };
}

// ─── plugin: static file copies ──────────────────────────────────────────────

function staticCopyPlugin(browser: string, outputDir: string): Plugin {
  return {
    name: "static-copy",
    async buildStart() {
      const copies: Array<[string, string]> = [
        // shortQuery
        [
          "node_modules/ShortQuery.js/bin/shortQuery.chrome.min.js",
          `${outputDir}/lib/shortQuery.min.js`,
        ],
        // rules.json (chrome only)
        ...(browser !== "firefox" && browser !== "tauri"
          ? [["src/rules.json", `${outputDir}/rules.json`] as [string, string]]
          : []),
      ];

      // browser-polyfill
      if (browser === "tauri") {
        copies.push(["src/browser-shim.js", `${outputDir}/lib/browser-polyfill.min.js`]);
      } else {
        copies.push([
          "node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
          `${outputDir}/lib/browser-polyfill.min.js`,
        ]);
      }

      await Promise.all(
        copies.map(async ([src, dest]) => {
          await fs.ensureDir(path.dirname(dest));
          await fs.copy(src, dest, { overwrite: true });
        }),
      );

      // monaco (large, copy whole dir)
      const monacoSrc = "node_modules/monaco-editor/min/vs";
      const monacoDest = `${outputDir}/lib/monaco/vs`;
      await fs.copy(monacoSrc, monacoDest, { overwrite: true });
    },
  };
}

// ─── main config ─────────────────────────────────────────────────────────────

export default defineConfig(() => {
  const browser = process.env.BROWSER || "chrome";
  const entry = process.env.ENTRY || "app";
  const outputDir = `./debug/${browser}`;

  const entryMap: Record<string, { file: string; name: string }> = {
    // app:           { file: "src/app.ts",                      name: "app" },
    // ui:            { file: "src/ui/ui.js",                    name: "UI" },
    // submit_res:    { file: "src/write/submit_res.js",         name: "submit_res" },
    // submit_thread: { file: "src/write/submit_thread.js",      name: "submit_thread" },
    browser:       { file: "src/view/browser/index.tsx",      name: "BrowserView" },
  };

  const { file, name } = entryMap[entry];

  return {
    plugins: [
      react(),
      scssPlugin(browser, outputDir),
      pugPlugin(browser, outputDir),
      imgPlugin(browser, outputDir),
      manifestPlugin(browser, outputDir),
      staticCopyPlugin(browser, outputDir),
    ],
    resolve: {
      alias: {
        src: path.resolve(__dirname, "./src"),
        packages: path.resolve(__dirname, "./packages"),
      },
      extensions: [".tsx", ".ts", ".jsx", ".js"],
    },
    build: {
      outDir: outputDir,
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, file),
        formats: ["iife"],
        name,
      },
      rollupOptions: {
        output: {
          entryFileNames: `${entry}.js`,
        },
      },
    },
  };
});
