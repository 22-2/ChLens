/**
@class MediaContainer
@constructor
@param {Element} container
*/
export default class MediaContainer {
  constructor(container) {
    /**
    @property _videoPlayTime
    @type Number
    @private
    */
    this.container = container;
    this._videoPlayTime = 0;

    this.setVideoEvents();
    this.setHoverEvents();
  }

  /**
  @method setHoverEvents
  */
  setHoverEvents() {
    const imageMode = app.config.get("zoom_image_mode");
    const videoMode = app.config.get("zoom_video_mode");
    const isImageHover = imageMode === "hover";
    const isVideoHover = videoMode === "hover";
    const isImageClick = imageMode === "click";
    const isVideoClick = videoMode === "click";
    const imageRatioConfig = app.config.get("zoom_ratio_image");
    const videoRatioConfig = app.config.get("zoom_ratio_video");
    const imageRatio = imageRatioConfig === "original" ? null : imageRatioConfig / 100;
    const videoRatio = videoRatioConfig === "original" ? null : videoRatioConfig / 100;

    // クリックでトグル表示
    this.container.on(
      "click",
      function (event) {
        const { target } = event;
        if (!target.matches(".thumbnail > a > img.image")) {
          return;
        }
        if (isImageClick && target.tagName === "IMG") {
          event.preventDefault();
          const thumbnail = target.closest(".thumbnail");
          if (thumbnail.hasClass("zoom")) {
            // 縮小
            thumbnail.removeClass("zoom");
            target.style.width = null;
            target.style.maxWidth = `${app.config.get("image_width")}px`;
            target.style.maxHeight = `${app.config.get("image_height")}px`;
          } else {
            // 拡大
            let zoomWidth;
            if (imageRatio === null) {
              zoomWidth = target.naturalWidth;
            } else {
              zoomWidth = parseInt(target.offsetWidth * imageRatio);
            }
            thumbnail.addClass("zoom");
            target.style.width = `${zoomWidth}px`;
            target.style.maxWidth = null;
            target.style.maxHeight = null;
          }
        }
      },
      true
    );

    this.container.on(
      "mouseenter",
      function ({ target }) {
        let zoomWidth;
        if (!target.matches(".thumbnail > a > img.image, .thumbnail > video")) {
          return;
        }
        // クリックモードの場合はホバーで拡大しない
        if (isImageClick && target.tagName === "IMG") {
          return;
        }
        if (isVideoClick && target.tagName === "VIDEO") {
          return;
        }

        if (isImageHover && target.tagName === "IMG") {
          if (imageRatio === null) {
            zoomWidth = target.naturalWidth;
          } else {
            zoomWidth = parseInt(target.offsetWidth * imageRatio);
          }
        } else if (isVideoHover && target.tagName === "VIDEO") {
          // Chromeでmouseenterイベントが複数回発生するのを回避するため
          if ("&[BROWSER]" === "chrome") {
            if (target.style.width !== "") {
              return;
            }
          }
          if (videoRatio === null) {
            zoomWidth = target.videoWidth;
          } else {
            zoomWidth = parseInt(target.offsetWidth * videoRatio);
          }
        } else {
          return;
        }
        target.closest(".thumbnail").addClass("zoom");
        target.style.width = `${zoomWidth}px`;
        target.style.maxWidth = null;
        target.style.maxHeight = null;
      },
      true
    );

    this.container.on(
      "mouseleave",
      function ({ target }) {
        if (
          !target.matches(".thumbnail > a > img.image, .thumbnail > video") ||
          ((!isImageHover || target.tagName !== "IMG") &&
            (!isVideoHover || target.tagName !== "VIDEO"))
        ) {
          return;
        }
        // クリックモードの場合はホバー解除で縮小しない
        if (isImageClick && target.tagName === "IMG") {
          return;
        }
        if (isVideoClick && target.tagName === "VIDEO") {
          return;
        }

        target.closest(".thumbnail").removeClass("zoom");
        target.style.width = null;
        if (target.tagName === "IMG") {
          target.style.maxWidth = `${app.config.get("image_width")}px`;
          target.style.maxHeight = `${app.config.get("image_height")}px`;
        } else if (target.tagName === "VIDEO") {
          target.style.maxWidth = `${app.config.get("video_width")}px`;
          target.style.maxHeight = `${app.config.get("video_height")}px`;
        }
      },
      true
    );
  }

  /**
  @method setVideoEvents
  */
  setVideoEvents() {
    const videoMode = app.config.get("zoom_video_mode");
    const isVideoClick = videoMode === "click";
    const videoRatioConfig = app.config.get("zoom_ratio_video");
    const videoRatio = videoRatioConfig === "original" ? null : videoRatioConfig / 100;

    // VIDEOの再生/一時停止とトグル拡大
    this.container.on("click", function (event) {
      const { target } = event;
      if (!target.matches(".thumbnail > video:not([data-src])")) {
        return;
      }

      // トグル拡大機能
      if (isVideoClick) {
        event.preventDefault();
        const thumbnail = target.closest(".thumbnail");
        if (thumbnail.hasClass("zoom")) {
          // 縮小
          thumbnail.removeClass("zoom");
          target.style.width = null;
          target.style.maxWidth = `${app.config.get("video_width")}px`;
          target.style.maxHeight = `${app.config.get("video_height")}px`;
        } else {
          // 拡大
          let zoomWidth;
          if (videoRatio === null) {
            zoomWidth = target.videoWidth;
          } else {
            zoomWidth = parseInt(target.offsetWidth * videoRatio);
          }
          thumbnail.addClass("zoom");
          target.style.width = `${zoomWidth}px`;
          target.style.maxWidth = null;
          target.style.maxHeight = null;
        }
      }

      // 再生/一時停止
      if (target.preload === "metadata") {
        target.preload = "auto";
      }
      if (target.paused) {
        target.play();
      } else {
        target.pause();
      }
    });

    // VIDEO再生中はマウスポインタを消す
    this.container.on(
      "mouseenter",
      ({ target }) => {
        if (!target.matches(".thumbnail > video:not([data-src])")) {
          return;
        }

        const func = ({ type }) => {
          this._controlVideoCursor(target, type);
        };

        target.on("play", func);
        target.on("timeupdate", func);
        target.on("pause", func);
        target.on("ended", func);
      },
      true
    );

    // マウスポインタのリセット
    this.container.on("mousemove", ({ target, type }) => {
      if (!target.matches(".thumbnail > video:not([data-src])")) {
        return;
      }
      this._controlVideoCursor(target, type);
    });
  }

  /**
  @method _setImageBlurOne
  @param {Element} thumbnail
  @param {Boolean} blurMode
  @static
  @private
  */
  static _setImageBlurOne(thumbnail, blurMode) {
    const media = thumbnail.$("a > img.image, video");
    if (blurMode) {
      const v = app.config.get("image_blur_length");
      thumbnail.addClass("image_blur");
      media.style.WebkitFilter = `blur(${v}px)`;
    } else {
      thumbnail.removeClass("image_blur");
      media.style.WebkitFilter = "none";
    }
  }

  /**
  @method setImageBlur
  @param {Element} res
  @param {Boolean} blurMode
  @static
  */
  static setImageBlur(res, blurMode) {
    for (let thumb of res.$$(
      ".thumbnail[media-type='image'], .thumbnail[media-type='video']"
    )) {
      MediaContainer._setImageBlurOne(thumb, blurMode);
    }
  }

  /**
  @method _controlVideoCursor
  @param {Element} ele
  @param {String} act
  @private
  */
  _controlVideoCursor(ele, act) {
    switch (act) {
      case "play":
        this._videoPlayTime = Date.now();
        break;
      case "timeupdate":
        if (ele.style.cursor === "none") {
          return;
        }
        if (Date.now() - this._videoPlayTime > 2000) {
          ele.style.cursor = "none";
        }
        break;
      case "pause":
      case "ended":
        ele.style.cursor = "auto";
        this._videoPlayTime = 0;
        break;
      case "mousemove":
        if (this._videoPlayTime === 0) {
          return;
        }
        ele.style.cursor = "auto";
        this._videoPlayTime = Date.now();
        break;
    }
  }
}
