import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import { build as esbuildBuild } from "esbuild";
import fs from "fs-extra";
import { glob } from "fs/promises";
import path from "path";
import postcss from "postcss";
import * as sass from "sass";
import { defineConfig, lazyPlugins, Plugin } from "vite-plus";

// ─── helpers ────────────────────────────────────────────────────────────────

const imgExt = (platform: string) => (platform === "chrome" ? "webp" : "png");

// ─── plugin: SCSS ────────────────────────────────────────────────────────────

function scssPlugin(platform: string, outputDir: string, minifyCss: boolean): Plugin {
  const ext = imgExt(platform);
  const isFirefox = platform === "firefox";

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
      style: minifyCss ? "compressed" : "expanded",
      functions: sassFunctions,
    });
    const pcResult = await pc.process(result.css, { from: srcFile });
    await fs.writeFile(destFile, pcResult.css);
  }

  return {
    name: "scss-build",
    async buildStart() {
      const jobs: Array<[string, string]> = (await Array.fromAsync(glob("src/view/*.scss"))).map(
        (f): [string, string] => [
          path.resolve(f),
          `${outputDir}/view/${path.basename(f, ".scss")}.css`,
        ],
      );

      await Promise.all(jobs.map(([src, dest]) => buildScss(src, dest)));
    },
  };
}

// ─── plugin: browser HTML (without Pug) ─────────────────────────────────────

function browserHtmlPlugin(outputDir: string): Plugin {
  const manifestJson = fs.readJsonSync("src/manifest.json");

  return {
    name: "browser-html-build",
    async buildStart() {
      const version = String(manifestJson.version ?? "");

      // browserビューは新UI(React)のエントリを直接起動したいため、
      // 旧Pugテンプレートを経由せずに互換HTMLをここで固定生成する。
      // no-referrer だと YouTube 埋め込みが client identity 不足で 153 になりやすいため、
      // クロスオリジンでは origin だけ送る既定寄りの方針にして他の外部埋め込みとも両立させる。
      const html = `<!DOCTYPE html><html class="view view_browser" data-app-version="${version}"><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><title>read.crx-2</title><script src="../browser.js?v=${version}" defer></script><link rel="stylesheet" href="/browser.css?v=${version}"></head><body><div id="root"></div></body></html>`;

      const outputFile = path.join(outputDir, "view", "browser.html");
      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeFile(outputFile, html);
    },
  };
}

// ─── plugin: images ──────────────────────────────────────────────────────────

const _IMG_LIST = [
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

// ─── plugin: manifest.json ───────────────────────────────────────────────────

function manifestPlugin(platform: string, outputDir: string): Plugin {
  return {
    name: "manifest-build",
    async buildStart() {
      if (platform === "tauri") return;
      await fs.ensureDir(outputDir);
      const m = await fs.readJson("src/manifest.json");

      if (platform === "chrome") {
        m.permissions = m.permissions.filter(
          (v: string) => !["webRequest", "webRequestBlocking"].includes(v),
        );
        delete m.background.scripts;
        delete m.applications;
      } else if (platform === "firefox") {
        m.manifest_version = 2;
        delete m.update_url;
        delete m.minimum_chrome_version;
        m.content_security_policy = m.content_security_policy.extension_pages;
        delete m.incognito;
        m.permissions = m.permissions.filter((v: string) => !["declarativeNetRequest"].includes(v));
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

function staticCopyPlugin(platform: string, outputDir: string, minifyJs: boolean): Plugin {
  return {
    name: "static-copy",
    async buildStart() {
      // 変更理由: content_scripts は manifest で単一JSを参照するため、
      // TS実装をここで bundle して常に最新の cs_addlink.js を出力する。
      await esbuildBuild({
        entryPoints: [
          path.resolve(__dirname, "src/cs_addlink.ts"),
          path.resolve(__dirname, "src/background.ts"),
        ],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "esnext",
        outdir: outputDir,
        minify: minifyJs,
      });

      const copies: Array<[string, string]> =
        platform !== "firefox" && platform !== "tauri"
          ? [["src/rules.json", `${outputDir}/rules.json`] as [string, string]]
          : [];

      // browser-polyfill
      if (platform === "tauri") {
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

      // vite.config.ts 内
      const monacoSrc = "node_modules/monaco-editor/min/vs";
      const monacoDest = `${outputDir}/lib/monaco/vs`;
      await fs.ensureDir(monacoDest);
      await fs.copy(monacoSrc, monacoDest, { overwrite: true });

      // ★ ハッシュ付き Worker をハッシュなしの名前にリネーム（コピー）するっす
      const assetsDir = path.join(monacoDest, "assets");
      if (await fs.pathExists(assetsDir)) {
        const files = await fs.readdir(assetsDir);
        for (const file of files) {
          // 例: json.worker-DKiEKt88.js -> json.worker.js に変換
          const match = file.match(/^(.+?\.worker)-[a-zA-Z0-9]+\.js$/);
          if (match) {
            await fs.copy(path.join(assetsDir, file), path.join(assetsDir, `${match[1]}.js`), {
              overwrite: true,
            });
          }
        }
      }
    },
  };
}

// ─── main config ─────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => {
  const platform = process.env.PLATFORM || "chrome";
  const entry = process.env.ENTRY || "browser";
  const outputDir = `./debug/${platform}`;
  const isWatchMode = process.argv.includes("--watch");
  const isWatchDev =
    isWatchMode && (mode === "development" || process.env.VITE_WATCH_DEV === "true");
  const minifyOutput = !isWatchDev;

  const entryMap: Record<string, { file: string; name: string }> = {
    // app:           { file: "src/app.ts",                      name: "app" },
    // ui:            { file: "src/ui/ui.js",                    name: "UI" },
    // submit_res:    { file: "src/write/submit_res.js",         name: "submit_res" },
    // submit_thread: { file: "src/write/submit_thread.js",      name: "submit_thread" },
    browser: { file: "src/view/browser/index.tsx", name: "BrowserView" },
  };

  const { file, name } = entryMap[entry];

  return {
    staged: {
      "src/**/*.{ts,tsx}": "vp check --fix",
    },
    fmt: {},
    lint: {
      plugins: ["oxc", "typescript", "unicorn", "react"],
      categories: {
        correctness: "warn",
      },
      env: {
        builtin: true,
      },
      ignorePatterns: [
        "debug/**",
        "playwright-report/**",
        "test-results/**",
        "src-tauri/target/**",
      ],
      rules: {
        "vite-plus/prefer-vite-plus-imports": "error",
      },
      overrides: [
        {
          files: ["src/**/*.{js,mjs,cjs,ts,tsx}"],
          rules: {
            "constructor-super": "error",
            "for-direction": "error",
            "getter-return": "error",
            "no-async-promise-executor": "error",
            "no-case-declarations": "error",
            "no-class-assign": "error",
            "no-compare-neg-zero": "error",
            "no-cond-assign": "error",
            "no-const-assign": "error",
            "no-constant-binary-expression": "error",
            "no-constant-condition": "error",
            "no-control-regex": "error",
            "no-debugger": "error",
            "no-delete-var": "error",
            "no-dupe-class-members": "error",
            "no-dupe-else-if": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-empty": "error",
            "no-empty-character-class": "error",
            "no-empty-pattern": "error",
            "no-empty-static-block": "error",
            "no-ex-assign": "error",
            "no-extra-boolean-cast": "error",
            "no-fallthrough": "error",
            "no-func-assign": "error",
            "no-global-assign": "error",
            "no-import-assign": "error",
            "no-invalid-regexp": "error",
            "no-irregular-whitespace": "error",
            "no-loss-of-precision": "error",
            "no-misleading-character-class": "error",
            "no-new-native-nonconstructor": "error",
            "no-nonoctal-decimal-escape": "error",
            "no-obj-calls": "error",
            "no-prototype-builtins": "error",
            "no-redeclare": "error",
            "no-regex-spaces": "error",
            "no-self-assign": "error",
            "no-setter-return": "error",
            "no-shadow-restricted-names": "error",
            "no-sparse-arrays": "error",
            "no-this-before-super": "error",
            "no-unassigned-vars": "error",
            "no-undef": "error",
            "no-unexpected-multiline": "error",
            "no-unreachable": "error",
            "no-unsafe-finally": "error",
            "no-unsafe-negation": "error",
            "no-unsafe-optional-chaining": "error",
            "no-unused-labels": "error",
            "no-unused-private-class-members": "error",
            "no-unused-vars": "error",
            "no-useless-assignment": "error",
            "no-useless-backreference": "error",
            "no-useless-catch": "error",
            "no-useless-escape": "error",
            "no-with": "error",
            "preserve-caught-error": "error",
            "require-yield": "error",
            "use-isnan": "error",
            "valid-typeof": "error",
            "no-array-constructor": "error",
            "no-unused-expressions": "error",
            "typescript/ban-ts-comment": "error",
            "typescript/no-duplicate-enum-values": "error",
            "typescript/no-empty-object-type": "error",
            "typescript/no-explicit-any": "error",
            "typescript/no-extra-non-null-assertion": "error",
            "typescript/no-misused-new": "error",
            "typescript/no-namespace": "error",
            "typescript/no-non-null-asserted-optional-chain": "error",
            "typescript/no-require-imports": "error",
            "typescript/no-this-alias": "error",
            "typescript/no-unnecessary-type-constraint": "error",
            "typescript/no-unsafe-declaration-merging": "error",
            "typescript/no-unsafe-function-type": "error",
            "typescript/no-wrapper-object-types": "error",
            "typescript/prefer-as-const": "error",
            "typescript/prefer-namespace-keyword": "error",
            "typescript/triple-slash-reference": "error",
          },
          env: {
            es2026: true,
            browser: true,
          },
          globals: {
            app: "readonly",
            browser: "readonly",
          },
        },
      ],
      options: {
        typeAware: true,
        typeCheck: true,
      },
      jsPlugins: [
        {
          name: "vite-plus",
          specifier: "vite-plus/oxlint-plugin",
        },
      ],
    },
    define: {
      // watch/dev でも production が注入されると分岐が壊れるため、Vite の mode を正として注入する。
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    plugins: lazyPlugins(() => [
      react(),
      browserHtmlPlugin(outputDir),
      scssPlugin(platform, outputDir, minifyOutput),
      manifestPlugin(platform, outputDir),
      staticCopyPlugin(platform, outputDir, minifyOutput),
    ]),
    resolve: {
      alias: {
        src: path.resolve(__dirname, "./src"),
        packages: path.resolve(__dirname, "./packages"),
        "webextension-polyfill":
          platform === "tauri"
            ? path.resolve(__dirname, "./src/browser-shim.js")
            : "webextension-polyfill",
      },
      extensions: [".tsx", ".ts", ".jsx", ".js"],
    },
    css: {
      preprocessorOptions: {
        scss: {
          functions: {
            "img($name)": (args: sass.Value[]) => {
              const name = (args[0] as sass.SassString).text;
              const ext = imgExt(platform);
              return new sass.SassString(`url(/img/${name}.${ext})`, {
                quotes: false,
              });
            },
            "vals($name)": (args: sass.Value[]) => {
              const name = (args[0] as sass.SassString).text;
              const isFirefox = platform === "firefox";
              let str = "";
              if (name === "scroll") {
                str = isFirefox ? "scroll" : "auto";
              }
              return new sass.SassString(str, { quotes: false });
            },
          },
        },
      },
    },
    build: {
      outDir: outputDir,
      emptyOutDir: false,
      minify: minifyOutput,
      lib: {
        entry: path.resolve(__dirname, file),
        formats: ["iife"],
        name,
      },
      rollupOptions: {
        output: {
          entryFileNames: `${entry}.js`,
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return `${entry}.css`;
            }
            return "[name].[ext]";
          },
        },
      },
    },
  };
});
