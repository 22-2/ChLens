const gulp = require("gulp");
const dir = require("require-dir");
const {browsers} = require("./gulp/config");

dir("./gulp");

for (let browser of browsers) {
  // Viteで処理されないタスク（CSS、HTML、画像、ライブラリなど）
  gulp.task(`build:other:${browser}`, gulp.parallel(
    `css:${browser}`,
    `html:${browser}`,
    `img:${browser}`,
    `manifest:${browser}`,
    `rules:${browser}`,
    `lib:${browser}`
  )
  );
  gulp.task(`pack:${browser}`, gulp.series(
    "clean",
    `build:other:${browser}`,
    `scan:${browser}`,
    `pack-in:${browser}`
  )
  );
  gulp.task(`watch:${browser}`, gulp.series(
    `build:other:${browser}`,
    `watch-in:${browser}`
  )
  );
}
gulp.task("build", gulp.task("build:other:chrome"));
gulp.task("pack", gulp.task("pack:chrome"));
gulp.task("watch", gulp.task("watch:chrome"));

gulp.task("default", gulp.task("build"));

gulp.task("build:all", gulp.parallel("build:other:chrome", "build:other:firefox"));
gulp.task("pack:all", gulp.parallel("pack:chrome", "pack:firefox"));
