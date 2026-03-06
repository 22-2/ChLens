gulp = require "gulp"
del = require "del"
header = require "gulp-header"
notify = require "gulp-notify"
plumber = require "gulp-plumber"
concat = require "gulp-concat"
rename = require "gulp-rename"
coffee = require "gulp-coffee"
minify = require "gulp-babel-minify"

packageJson = require "./package.json"
banner =
  """
  /*!
   * <%= packageJson.name %> v<%= packageJson.version %>  <%= packageJson.license %> License
   * (C) 2015 <%= packageJson.authorName %>
   */

  """
bannerChrome =
  """
  /*!
   * <%= packageJson.name %> v<%= packageJson.version %>-chrome  <%= packageJson.license %> License
   * (C) 2015 <%= packageJson.authorName %>
   */

  """
src = "./src"
srcchrome = "./src-chrome"
bin = "./bin"

gulp.task "coffee", ->
  return gulp.src("#{src}/**/*.coffee")
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(coffee())
    .pipe(concat("shortQuery.js"))
    .pipe(header(banner, packageJson: packageJson))
    .pipe(gulp.dest(bin))
    .pipe(minify())
    .pipe(header(banner, packageJson: packageJson))
    .pipe(rename(extname: ".min.js"))
    .pipe(gulp.dest(bin))

gulp.task "chrome-coffee", ->
  return gulp.src("#{srcchrome}/**/*.coffee")
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(coffee())
    .pipe(concat("shortQuery.chrome.js"))
    .pipe(header(bannerChrome, packageJson: packageJson))
    .pipe(gulp.dest(bin))
    .pipe(minify())
    .pipe(header(bannerChrome, packageJson: packageJson))
    .pipe(rename(extname: ".min.js"))
    .pipe(gulp.dest(bin))

gulp.task "default", ["compile"]
gulp.task "compile", ["coffee", "chrome-coffee"]

gulp.task "clean", (cb) ->
  return del ["./bin", "./release"], cb

gulp.task "watch", ["default"], ->
  gulp.watch "#{src}/*.coffee", ["coffee"]
  gulp.watch "#{srcchrome}/*.coffee", ["chrome-coffee"]
  return
