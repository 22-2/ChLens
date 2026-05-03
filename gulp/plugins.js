const sassCompiler = require("sass");
const sass = require("gulp-sass")(sassCompiler);
// Some gulp plugins moved to ESM default exports in newer versions.
// This loader keeps existing CommonJS task code working across both module formats.
const loadPlugin = (id) => {
  try {
    const mod = require(id);
    return mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
  } catch (e) {
    // ESMモジュールの場合はrequireが失敗するため、動的importを使用
    if (e.code === "ERR_REQUIRE_ESM") {
      throw new Error(
        `ESM module "${id}" cannot be loaded with require(). ` +
        `Please use dynamic import() instead or update the build configuration.`
      );
    }
    throw e;
  }
};

// ESMモジュールを動的にインポート
const loadPluginAsync = async (id) => {
  const mod = await import(id);
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
    filter: require("gulp-filter"),
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
