const gulp = require("gulp");
const path = require("path");
const { gulp: $, rolldown: _ } = require("./plugins");
const { browsers, paths, defaultOptions } = require("./config");
const { makeInOut, getRolldownIOConfigs } = require("./js");
const util = require("./util");

const makeRolldownConfig = function (browser, configName) {
  const config = getRolldownIOConfigs(configName, browser);
  const c = makeInOut(browser, config);
  return {
    ...c.input,
    output: c.output,
  };
};

const rolldownWatch = function (config) {
  const filename = path.basename(config.output.file);
  const watcher = _.rolldown.watch(config);
  watcher.on("event", util.onRollupWatch(filename));
};

/*
  tasks
*/
const watch = function (browser) {
  const appjsConfig = makeRolldownConfig(browser, "app");
  const corejsConfig = makeRolldownConfig(browser, "core");
  const uijsConfig = makeRolldownConfig(browser, "ui");
  const submitResjsConfig = makeRolldownConfig(browser, "submitRes");
  const submitThreadjsConfig = makeRolldownConfig(browser, "submitThread");
  return function () {
    rolldownWatch(appjsConfig);
    rolldownWatch(corejsConfig);
    rolldownWatch(uijsConfig);
    rolldownWatch(submitResjsConfig);
    rolldownWatch(submitThreadjsConfig);
    gulp.watch(
      [paths.lib.webExtPolyfill, paths.js.background],
      gulp.task(`js:background.js:${browser}`),
    );
    gulp.watch(paths.js.csAddlink, gulp.task(`js:cs_addlink.js:${browser}`));
    gulp.watch(paths.js.view, gulp.task(`js:view:${browser}`));
    gulp.watch(
      [paths.lib.webExtPolyfill, paths.js.zombie],
      gulp.task(`js:zombie.js:${browser}`),
    );
    gulp.watch(paths.js.csWrite, gulp.task(`js:cs_write.js:${browser}`));
    gulp.watch(paths.css.ui, gulp.task(`css:ui.css:${browser}`));
    gulp.watch(paths.css.view, gulp.task(`css:view:${browser}`));
    gulp.watch(paths.css.write, gulp.task(`css:write:${browser}`));
    gulp.watch(paths.html.view, gulp.task(`html:view:${browser}`));
    gulp.watch(paths.html.zombie, gulp.task(`html:zombie.html:${browser}`));
    gulp.watch(paths.html.write, gulp.task(`html:write:${browser}`));
    gulp.watch(paths.img.imgsSrc, gulp.task(`img:${browser}`));
    gulp.watch(paths.manifest, gulp.task(`manifest:${browser}`));
    gulp.watch(paths.rules, gulp.task(`rules:${browser}`));
    gulp.watch(paths.lib.shortQuery, gulp.task(`lib:shortQuery:${browser}`));
    gulp.watch(
      paths.lib.webExtPolyfill,
      gulp.task(`lib:webExtPolyfill:${browser}`),
    );
  };
};

/*
  gulp task
*/
for (let browser of browsers) {
  gulp.task(`watch-in:${browser}`, watch(browser));
}

gulp.task("watch-in", gulp.task("watch-in:chrome"));
