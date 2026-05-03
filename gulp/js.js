const path = require("path");
const gulp = require("gulp");
const { gulp: $, rolldown: _ } = require("./plugins");
const { browsers, paths, defaultOptions } = require("./config");
const util = require("./util");

const getReplaceMap = (browser) => ({
  BROWSER: browser,
  IMG_EXT: browser === "chrome" ? "webp" : "png",
});

/*
  rolldown
*/
const makeInOut = function (
  browser,
  { output, pathname, plugins, outObj = {} },
) {
  const i = Object.assign({}, defaultOptions.rolldown.in);
  i.input = paths.js[pathname];
  if (plugins != null) {
    i.plugins = plugins.concat(i.plugins);
  }

  const o = Object.assign({}, defaultOptions.rolldown.out, outObj);
  o.file = `${paths.output[browser]}/${output}`;
  return { input: i, output: o };
};
exports.makeInOut = makeInOut;

const getRolldownIOConfigs = function (name, browser) {
  const replace = _.replace({
    delimiters: ["&\\[", "\\]"],
    preventAssignment: true,
    values: getReplaceMap(browser),
  });
  switch (name) {
    case "app":
      return {
        pathname: "app",
        output: "app.js",
        plugins: [replace],
        outObj: {
          name: "app",
        },
      };
      break;
    case "core":
      return {
        pathname: "core",
        output: "app_core.js",
        plugins: [replace],
        outObj: {
          name: "app",
          extend: true,
        },
      };
      break;
    case "ui":
      return {
        pathname: "ui",
        output: "ui.js",
        plugins: [replace],
        outObj: {
          name: "UI",
        },
      };
      break;
    case "submitRes":
      return {
        pathname: "submitRes",
        output: "write/submit_res.js",
        plugins: [replace],
      };
      break;
    case "submitThread":
      return {
        pathname: "submitThread",
        output: "write/submit_thread.js",
        plugins: [replace],
      };
      break;
    case "browser":
      return {
        pathname: "browser",
        output: "view/browser.js",
        plugins: [replace],
        outObj: {
          name: "BrowserView",
        },
      };
      break;
  }
  throw new Error(`Error: rolldownIOConfig Not Found '${name}'`);
};
exports.getRolldownIOConfigs = getRolldownIOConfigs;

const makeFunc = function (browser, configName) {
  const args = getRolldownIOConfigs(configName, browser);
  const filename = path.basename(args.output);
  const { input: i, output: o } = makeInOut(browser, args);
  const func = async function () {
    try {
      const build = await _.rolldown.rolldown(i);
      await build.write(o);
    } catch (e) {
      util.onRollupError(filename)(e);
    }
  };
  func.displayName = `js:${filename}:${browser}`;
  return func;
};

const app = (browser) => makeFunc(browser, "app");
const core = (browser) => makeFunc(browser, "core");
const ui = (browser) => makeFunc(browser, "ui");
const submitRes = (browser) => makeFunc(browser, "submitRes");
const submitThread = (browser) => makeFunc(browser, "submitThread");
const browserView = (browser) => makeFunc(browser, "browser");

/*
  tasks
*/
const rr = /&\[(\w+)\]/g;
const makeReplaceOptions = function (browser) {
  const rm = getReplaceMap(browser);
  return (m, p1) => rm[p1];
};

const background = function (browser) {
  const output = paths.output[browser];
  const ro = makeReplaceOptions(browser);
  return () =>
    // Keep this task as a single vinyl stream to ensure gulp can always detect completion in parallel builds.
    gulp
      .src([paths.lib.webExtPolyfill, paths.js.background])
      .pipe($.replace(rr, ro))
      .pipe($.concat("background.js"))
      .pipe(gulp.dest(output));
};

var csAddlink = function (browser) {
  const output = paths.output[browser];
  const ro = makeReplaceOptions(browser);
  return () =>
    gulp
      .src(paths.js.csAddlink, { since: gulp.lastRun(csAddlink) })
      .pipe($.replace(rr, ro))
      .pipe(gulp.dest(output));
};

var view = function (browser) {
  const output = paths.output[browser] + "/view";
  const ro = makeReplaceOptions(browser);
  return () =>
    gulp
      .src(paths.js.view, { since: gulp.lastRun(view) })
      .pipe($.replace(rr, ro))
      .pipe(gulp.dest(output));
};

var zombie = function (browser) {
  const output = paths.output[browser];
  const ro = makeReplaceOptions(browser);
  return () =>
    gulp
      .src(paths.js.zombie, { since: gulp.lastRun(zombie) })
      .pipe($.replace(rr, ro))
      .pipe(gulp.dest(output));
};

var csWrite = function (browser) {
  const output = paths.output[browser] + "/write";
  const ro = makeReplaceOptions(browser);
  return () =>
    gulp
      .src(paths.js.csWrite, { since: gulp.lastRun(csWrite) })
      .pipe($.replace(rr, ro))
      .pipe(gulp.dest(output));
};

/*
  gulp task
*/
for (let browser of browsers) {
  gulp.task(`js:background.js:${browser}`, background(browser));
  gulp.task(`js:cs_addlink.js:${browser}`, csAddlink(browser));
  gulp.task(`js:view:${browser}`, view(browser));
  gulp.task(`js:zombie.js:${browser}`, zombie(browser));
  gulp.task(`js:cs_write.js:${browser}`, csWrite(browser));

  gulp.task(
    `js:${browser}`,
    gulp.parallel(
      app(browser),
      core(browser),
      ui(browser),
      submitRes(browser),
      submitThread(browser),
      browserView(browser),
      `js:background.js:${browser}`,
      `js:cs_addlink.js:${browser}`,
      `js:view:${browser}`,
      `js:zombie.js:${browser}`,
      `js:cs_write.js:${browser}`,
    ),
  );
}

gulp.task("js", gulp.task("js:chrome"));
