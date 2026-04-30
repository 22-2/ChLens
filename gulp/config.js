const fs = require("fs-extra");
const path = require("path");
const { compiler: c, rolldown: _, postcss: p } = require("./plugins");
const util = require("./util");

const browsers = ["chrome", "firefox", "tauri"];

let paths = {};
(function () {
  const i = "./src";
  paths = {
    output: {},
    js: {
      app: `${i}/app.ts`,
      core: `${i}/core/core.js`,
      ui: `${i}/ui/ui.js`,
      submitRes: `${i}/write/submit_res.js`,
      submitThread: `${i}/write/submit_thread.js`,
      threadReact: `${i}/view/thread/index.tsx`,
      browser: `${i}/view/browser/index.tsx`,
      background: `${i}/background.js`,
      csAddlink: `${i}/cs_addlink.js`,
      view: `${i}/view/*.js`,
      zombie: `${i}/zombie.js`,
      csWrite: `${i}/write/cs_write.js`,
    },
    css: {
      ui: [`${i}/ui/*.scss`, `${i}/_common.scss`],
      view: [`${i}/view/*.scss`, `${i}/_common.scss`],
      write: [`${i}/write/*.scss`, `${i}/_common.scss`],
    },
    html: {
      view: [`${i}/view/*.pug`, `${i}/_base.pug`],
      zombie: [`${i}/zombie.pug`, `${i}/_base.pug`],
      write: [`${i}/write/*.pug`, `${i}/_base.pug`],
      notBasePugs: ["**/*.pug", "!**/_*.pug"],
    },
    img: {
      imgsSrc: `${i}/image/svg`,
      imgs: [
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
      ],
      icon: `${i}/image/svg/read.crx.svg`,
      logoBig: `${i}/image/svg/read.crx.svg`,
      loading: `${i}/image/svg/loading.svg`,
    },
    lib: {
      shortQuery: "./node_modules/ShortQuery.js/bin/shortQuery.chrome.min.js",
      webExtPolyfill:
        "./node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
      monaco: "./node_modules/monaco-editor/min/vs/**/*",
    },
    manifest: `${i}/manifest.json`,
    rules: `${i}/rules.json`,
  };
})();

for (let browser of browsers) {
  paths.output[browser] = `./debug/${browser}`;
}

// tauri用: browser-polyfillの代わりにシムを使う
paths.lib.browserShim = "./src/browser-shim.js";

const manifestJson = fs.readJsonSync(paths.manifest);

const defaultOptions = {
  plumber: {
    errorHandler: util.plumberHandler,
  },
  rollupTs: {
    typescript: c.ts,
  },
  sass: {
    outputStyle: "compressed",
  },
  postcss: [p.autoprefixer()],
  postcss_tailwind: [p.tailwindcss(), p.autoprefixer()],
  pug: {
    pug: c.pug,
    locals: manifestJson,
  },
  sharp: {
    webp: {
      lossless: true,
    },
  },
};

defaultOptions.rolldown = {
  in: {
    plugins: [],
    platform: "browser",
    resolve: {
      // ソース側の絶対パスimport（src/...）を維持したまま、bundler解決先を明示する。
      alias: {
        src: path.resolve(__dirname, "..", "src"),
        packages: path.resolve(__dirname, "..", "packages"),
      },
      extensions: [".tsx", ".ts", ".jsx", ".js"],
    },
    onwarn: util.rollupOnWarn,
  },
  out: {
    format: "iife",
  },
};

module.exports = { browsers, paths, defaultOptions, manifest: manifestJson };
