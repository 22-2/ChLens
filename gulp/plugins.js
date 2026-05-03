const sassCompiler = require("sass");
const sass = require("gulp-sass")(sassCompiler);

// ESMモジュールをrequireで読み込むためのヘルパー
const loadPlugin = (id) => {
  const mod = require(id);
  return mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
};

const webExt = (async () => {
  return await import("web-ext");
})();

module.exports = {
  compiler: {
    ts: require("typescript"),
    sass: sassCompiler,
    pug: require("pug"),
  },
  gulp: {
    gulp: require("gulp"),
    plumber: require("gulp-plumber"),
    concat: require("gulp-concat"),
    notify: require("gulp-notify"),
    merge: require("merge2"),
    rename: require("gulp-rename"),
    replace: require("gulp-replace"),
    sass,
    postcss: require("gulp-postcss"),
    pug: require("gulp-pug"),
  },
  rolldown: {
    rolldown: require("rolldown"),
    replace: require("@rollup/plugin-replace"),
  },
  postcss: {
    autoprefixer: require("autoprefixer"),
    tailwindcss: require("@tailwindcss/postcss"),
  },
  other: {
    sharp: require("sharp"),
    crx3: require("crx3"),
    webExt: webExt,
  },
};
