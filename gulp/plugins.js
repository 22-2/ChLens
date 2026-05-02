const sassCompiler = require("sass");
const sass = require("gulp-sass")(sassCompiler);
// Some gulp plugins moved to ESM default exports in newer versions.
// This loader keeps existing CommonJS task code working across both module formats.
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
    gulp: loadPlugin("gulp"),
    plumber: loadPlugin("gulp-plumber"),
    filter: loadPlugin("gulp-filter"),
    concat: loadPlugin("gulp-concat"),
    notify: loadPlugin("gulp-notify"),
    merge: loadPlugin("merge2"),
    rename: loadPlugin("gulp-rename"),
    replace: loadPlugin("gulp-replace"),
    sass,
    postcss: loadPlugin("gulp-postcss"),
    pug: loadPlugin("gulp-pug"),
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
