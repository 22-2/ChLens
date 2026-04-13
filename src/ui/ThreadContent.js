let ThreadContent;
import MessageProcessor from "../core/MessageProcessor.js";
import ThreadModel from "../core/ThreadModel.js";
import MediaContainer from "./MediaContainer.js";

/**
@class ThreadContent
@constructor
@param {String} URL
@param {Element} container
*/
export default ThreadContent = (function () {
  ThreadContent = class ThreadContent {
    static initClass() {}

    /**
    @method constructor
    @param {String} url
    @param {Element} container
    */
    constructor(url, container) {
      /**
      @property url
      @type {any}
      */
      this.setNG = this.setNG.bind(this);
      this._chainNG = this._chainNG.bind(this);
      this._chainNgById = this._chainNgById.bind(this);
      this._chainNgBySlip = this._chainNgBySlip.bind(this);
      this._checkNG = this._checkNG.bind(this);
      this.refreshNG = this.refreshNG.bind(this);
      this.container = container;
      this.url = url;

      this.model = new ThreadModel(url);
      this.urlStr = this.model.url.href;

      /**
      @property _lastScrollInfo
      @type Object
      @private
      */
      this._lastScrollInfo = {
        resNum: 0,
        animate: false,
        offset: 0,
        animateTo: 0,
        animateChange: 0,
      };

      /**
      @property _timeoutID
      @type Number
      @private
      */
      this._timeoutID = 0;

      /**
      @property _hiddenSelectors
      @type {string[] | null}
      @private
      */
      this._hiddenSelectors = null;

      /**
      @property _isScrolling
      @type Boolean
      @private
      */
      this._isScrolling = false;

      /**
      @property _scrollRequestID
      @type Number
      @private
      */
      this._scrollRequestID = 0;

      try {
        this.harmfulReg = new RegExp(app.config.get("image_blur_word"));
        this.findHarmfulFlag = true;
      } catch (e) {
        app.message.send("notify", {
          message: `\
画像ぼかしの正規表現を読み込むのに失敗しました
画像ぼかし機能は無効化されます\
`,
          background_color: "red",
        });
        this.findHarmfulFlag = false;
      }

      this.container.on("scrollstart", () => {
        this._isScrolling = true;
      });
      this.container.on("scrollfinish", () => {
        this._isScrolling = false;
      });
    }

    get idIndex() {
      return this.model.idIndex;
    }
    get slipIndex() {
      return this.model.slipIndex;
    }
    get tripIndex() {
      return this.model.tripIndex;
    }
    get repIndex() {
      return this.model.repIndex;
    }
    get repNgIndex() {
      return this.model.repNgIndex;
    }
    get ancIndex() {
      return this.model.ancIndex;
    }

    /**
    @method init
    @static
    @param {String} url
    @param {Element} container
    @return {Promise<ThreadContent>}
    */
    static async init(url, container) {
      const threadContent = new ThreadContent(url, container);
      await threadContent.initSikiGuard();

      return threadContent;
    }

    /**
    @method initSikiGuard
    */
    async initSikiGuard() {
      if (app.config.isOn("use_siki_guard")) {
        const { status, message, data } = await app.SikiGuard.get(this.url);
        if (status !== "success") {
          app.message.send("notify", { message });
        }
        // @ts-ignore
        this.model._sikiGuardNgIdMap = data;
      }
    }

    /**
    @method _reScrollTo
    @private
    */
    _reScrollTo() {
      this.scrollTo(
        this._lastScrollInfo.resNum,
        this._lastScrollInfo.animate,
        this._lastScrollInfo.offset,
        true,
      );
    }

    /**
    @method isHidden
    */
    isHidden(ele) {
      if (this._hiddenSelectors == null) {
        this._hiddenSelectors = [];
        const css = $$.I("user_css").sheet.cssRules;
        for (let { selectorText, style, type } of css) {
          if (type === 1) {
            if (style.display === "none") {
              this._hiddenSelectors.push(selectorText);
            }
          }
        }
      }
      return (
        (ele.hasClass("ng") && !app.config.isOn("display_ng")) ||
        this._hiddenSelectors.some((selector) => ele.matches(selector))
      );
    }

    /**
    @method _loadNearlyImages
    @param {Number} resNum
    @param {Number} [offset=0]
    @return {Boolean} loadFlag
    */
    _loadNearlyImages(resNum, offset) {
      let isHidden;
      if (offset == null) {
        offset = 0;
      }
      let loadFlag = false;
      const target = this.container.children[resNum - 1];

      const { offsetHeight: containerHeight, scrollHeight: containerScroll } =
        this.container;
      let viewTop = target.offsetTop;
      if (offset < 0) {
        viewTop += offset;
      }
      let viewBottom = viewTop + containerHeight;
      if (viewBottom > containerScroll) {
        viewBottom = containerScroll;
        viewTop = viewBottom - containerHeight;
      }

      // 遅延ロードの解除
      const loadImageByElement = (targetElement) => {
        for (let media of targetElement.$$("img[data-src], video[data-src]")) {
          loadFlag = true;
          media.emit(new Event("immediateload", { bubbles: true }));
        }
      };

      // 表示範囲内の要素をスキャンする
      // (上方)
      let tmpTarget = target;
      while (
        tmpTarget &&
        ((isHidden = this.isHidden(tmpTarget)) ||
          tmpTarget.offsetTop + tmpTarget.offsetHeight > viewTop)
      ) {
        if (!isHidden) {
          loadImageByElement(tmpTarget);
        }
        tmpTarget = tmpTarget.prev();
      }
      // (下方)
      tmpTarget = target.next();
      while (
        tmpTarget &&
        ((isHidden = this.isHidden(tmpTarget)) ||
          tmpTarget.offsetTop < viewBottom)
      ) {
        if (!isHidden) {
          loadImageByElement(tmpTarget);
        }
        tmpTarget = tmpTarget.next();
      }

      // 遅延スクロールの設定
      if (
        (loadFlag || this._timeoutID !== 0) &&
        !app.config.isOn("image_height_fix")
      ) {
        if (this._timeoutID !== 0) {
          clearTimeout(this._timeoutID);
        }
        const delayScrollTime = parseInt(app.config.get("delay_scroll_time"));
        this._timeoutID = setTimeout(() => {
          this._timeoutID = 0;
          return this._reScrollTo();
        }, delayScrollTime);
      }

      return loadFlag;
    }

    /**
    @method scrollTo
    @param {Element | Number} target
    @param {Boolean} [animate=false]
    @param {Number} [offset=0]
    @param {Boolean} [rerun=false]
    */
    scrollTo(target, animate, offset, rerun) {
      let resNum;
      if (animate == null) {
        animate = false;
      }
      if (offset == null) {
        offset = 0;
      }
      if (rerun == null) {
        rerun = false;
      }
      if (typeof target === "number") {
        resNum = target;
      } else {
        resNum = +target.C("num")[0].textContent;
      }
      this._lastScrollInfo.resNum = resNum;
      this._lastScrollInfo.animate = animate;
      this._lastScrollInfo.offset = offset;

      target = this.container.children[resNum - 1];

      // 検索中で、ターゲットが非ヒット項目で非表示の場合、スクロールを中断
      if (
        target &&
        this.container.hasClass("searching") &&
        !target.hasClass("search_hit")
      ) {
        target = null;
      }

      // もしターゲットがNGだった場合、その直前/直後の非NGレスをターゲットに変更する
      if (target && this.isHidden(target)) {
        let replaced = target;
        while ((replaced = replaced.prev())) {
          if (!this.isHidden(replaced)) {
            target = replaced;
            break;
          }
          if (replaced == null) {
            replaced = target;
            while ((replaced = replaced.next())) {
              if (!this.isHidden(replaced)) {
                target = replaced;
                break;
              }
            }
          }
        }
      }

      if (target) {
        // 前後に存在する画像を事前にロードする
        if (!rerun) {
          this._loadNearlyImages(resNum, offset);
        }

        // offsetが比率の場合はpxを求める
        if (0 < offset && offset < 1) {
          offset = Math.round(target.offsetHeight * offset);
        }

        // 遅延スクロール時の実行必要性確認
        if (rerun && this.container.scrollTop === target.offsetTop + offset) {
          return;
        }

        // スクロールの実行
        if (animate) {
          let rerunAndCancel = false;
          if (this._isScrolling) {
            cancelAnimationFrame(this._scrollRequestID);
            if (rerun) {
              rerunAndCancel = true;
            }
          }
          (() => {
            let _scrollInterval, change;
            this.container.emit(new Event("scrollstart"));

            let to = target.offsetTop + offset;
            let movingHeight = to - this.container.scrollTop;
            if (rerunAndCancel && to === this._lastScrollInfo.animateTo) {
              change = this._lastScrollInfo.animateChange;
            } else {
              change = Math.max(Math.round(movingHeight / 15), 1);
            }
            let min = Math.min(to - change, to + change);
            let max = Math.max(to - change, to + change);
            if (!rerun) {
              this._lastScrollInfo.animateTo = to;
              this._lastScrollInfo.animateChange = change;
            }

            return (this._scrollRequestID = requestAnimationFrame(
              (_scrollInterval = () => {
                const before = this.container.scrollTop;
                // 画像のロードによる座標変更時の補正
                if (to !== target.offsetTop + offset) {
                  to = target.offsetTop + offset;
                  if (to - this.container.scrollTop > movingHeight) {
                    movingHeight = to - this.container.scrollTop;
                    change = Math.max(Math.round(movingHeight / 15), 1);
                  }
                  min = Math.min(to - change, to + change);
                  max = Math.max(to - change, to + change);
                  if (!rerun) {
                    this._lastScrollInfo.animateTo = to;
                    this._lastScrollInfo.animateChange = change;
                  }
                }
                // 例外発生時の停止処理
                if (
                  (change > 0 && this.container.scrollTop > max) ||
                  (change < 0 && this.container.scrollTop < min)
                ) {
                  this.container.scrollTop = to;
                  this.container.emit(new Event("scrollfinish"));
                  return;
                }
                // 正常時の処理
                if (
                  min <= this.container.scrollTop &&
                  this.container.scrollTop <= max
                ) {
                  this.container.scrollTop = to;
                  this.container.emit(new Event("scrollfinish"));
                  return;
                } else {
                  this.container.scrollTop += change;
                }
                if (this.container.scrollTop === before) {
                  this.container.emit(new Event("scrollfinish"));
                  return;
                }
                this._scrollRequestID = requestAnimationFrame(_scrollInterval);
              }),
            ));
          })();
        } else {
          this.container.scrollTop = target.offsetTop + offset;
        }
      }
    }

    /**
    @method getRead
    @param {Number} beforeRead 直近に読んでいたレスの番号
    @return {Number} 現在読んでいると推測されるレスの番号
    */
    getRead(beforeRead) {
      let read;
      if (beforeRead == null) {
        beforeRead = 1;
      }
      const containerBottom =
        this.container.scrollTop + this.container.clientHeight;
      const $read = this.container.children[beforeRead - 1];
      const readTop = $read != null ? $read.offsetTop : undefined;
      if (
        !$read ||
        (readTop < containerBottom &&
          containerBottom < readTop + $read.offsetHeight)
      ) {
        return beforeRead;
      }

      // 最後のレスはcontainerの余白の関係で取得できないので別で判定
      const $last = this.container.last();
      if ($last.offsetTop < containerBottom) {
        return this.container.children.length;
      }

      // 直近に読んでいたレスの上下を順番に調べる
      let $next = $read.next();
      let $prev = $read.prev();
      while (true) {
        if ($next != null) {
          const nextTop = $next.offsetTop;
          if (
            nextTop < containerBottom &&
            containerBottom < nextTop + $next.offsetHeight
          ) {
            read = $next.C("num")[0].textContent;
            break;
          }
          $next = $next.next();
        }
        if ($prev != null) {
          const prevTop = $prev.offsetTop;
          if (
            prevTop < containerBottom &&
            containerBottom < prevTop + $prev.offsetHeight
          ) {
            read = $prev.C("num")[0].textContent;
            break;
          }
          $prev = $prev.prev();
        }
        // どのレスも判定されなかった場合
        if ($next == null && $prev == null) {
          break;
        }
      }

      // >>1の底辺が表示領域外にはみ出していた場合対策
      if (read == null) {
        return 1;
      }

      return parseInt(read);
    }

    /**
    @method getDisplay
    @param {Number} beforeRead 直近に読んでいたレスの番号
    @return {Object|null} 現在表示していると推測されるレスの番号とオフセット
    */
    getDisplay(beforeRead) {
      const containerTop = this.container.scrollTop;
      const containerBottom = containerTop + this.container.clientHeight;
      const resRead = { resNum: 1, offset: 0, bottom: false };

      // 既に画面の一番下までスクロールしている場合
      // (いつのまにか位置がずれていることがあるので余裕を設ける)
      if (containerBottom >= this.container.scrollHeight - 60) {
        resRead.bottom = true;
      }

      let $read = this.container.children[beforeRead - 1];
      if (!$read) {
        return null;
      }
      const readTop = $read.offsetTop;
      if (
        !(readTop < containerTop && containerTop < readTop + $read.offsetHeight)
      ) {
        // 直近に読んでいたレスの上下を順番に調べる
        let $next = $read.next();
        let $prev = $read.prev();
        while (true) {
          if ($next != null) {
            const nextTop = $next.offsetTop;
            if (
              nextTop <= containerTop &&
              containerTop < nextTop + $next.offsetHeight
            ) {
              $read = $next;
              break;
            }
            $next = $next.next();
          }
          if ($prev != null) {
            const prevTop = $prev.offsetTop;
            if (
              prevTop <= containerTop &&
              containerTop < prevTop + $prev.offsetHeight
            ) {
              $read = $prev;
              break;
            }
            $prev = $prev.prev();
          }
          // どのレスも判定されなかった場合
          if ($next == null && $prev == null) {
            break;
          }
        }
      }

      resRead.resNum = parseInt($read.C("num")[0].textContent);
      resRead.offset = (containerTop - $read.offsetTop) / $read.offsetHeight;

      return resRead;
    }

    /**
    @method getSelected
    @return {Element|null}
    */
    getSelected() {
      return this.container.$("article.selected");
    }

    /**
    @method select
    @param {Element | Number} target
    @param {Boolean} [preventScroll = false]
    @param {Boolean} [animate = false]
    @param {Number} [offset = 0]
    */
    select(target, preventScroll, animate, offset) {
      if (preventScroll == null) {
        preventScroll = false;
      }
      if (animate == null) {
        animate = false;
      }
      if (offset == null) {
        offset = 0;
      }
      __guard__(this.container.$("article.selected"), (x) =>
        x.removeClass("selected"),
      );

      if (typeof target === "number") {
        target = this.container.$(
          `article:nth-child(${target}), article:last-child`,
        );
      }

      if (!target) {
        return;
      }

      target.addClass("selected");
      if (!preventScroll) {
        this.scrollTo(target, animate, offset);
      }
    }

    /**
    @method clearSelect
    */
    clearSelect() {
      __guard__(this.getSelected(), (x) => x.removeClass("selected"));
    }

    /**
    @method selectNext
    @param {number} [repeat = 1]
    */
    selectNext(repeat) {
      let bottom;
      if (repeat == null) {
        repeat = 1;
      }
      let current = this.getSelected();
      const containerHeight = this.container.offsetHeight;

      if (current) {
        let top;
        ({ top, bottom } = current.getBoundingClientRect());
        // 現在選択されているレスが表示範囲外だった場合、それを無視する
        if (top >= containerHeight || bottom <= 0) {
          current = null;
        }
      }

      if (!current) {
        this.select(this.container.child()[this.getRead() - 1], true);
      } else {
        let target = current;

        for (
          let i = 0, end = repeat, asc = 0 <= end;
          asc ? i < end : i > end;
          asc ? i++ : i--
        ) {
          let targetHeight;
          const prevTarget = target;

          let { bottom: targetBottom } = target.getBoundingClientRect();
          if (targetBottom <= containerHeight && target.next()) {
            target = target.next();

            while (target && this.isHidden(target)) {
              target = target.next();
            }
          }

          if (!target) {
            target = prevTarget;
            break;
          }

          ({ bottom: targetBottom, height: targetHeight } =
            target.getBoundingClientRect());
          if (containerHeight < targetBottom) {
            if (targetHeight >= containerHeight) {
              this.container.scrollTop += containerHeight * 0.5;
            } else {
              this.container.scrollTop += targetBottom - containerHeight + 10;
            }
          } else if (!target.next()) {
            this.container.scrollTop += containerHeight * 0.5;
            if (target === prevTarget) {
              break;
            }
          }
        }

        if (target && target !== current) {
          this.select(target, true);
        }
      }
    }

    /**
    @method selectPrev
    @param {number} [repeat = 1]
    */
    selectPrev(repeat) {
      let top;
      if (repeat == null) {
        repeat = 1;
      }
      let current = this.getSelected();
      const containerHeight = this.container.offsetHeight;

      if (current) {
        let bottom;
        ({ top, bottom } = current.getBoundingClientRect());
        // 現在選択されているレスが表示範囲外だった場合、それを無視する
        if (top >= containerHeight || bottom <= 0) {
          current = null;
        }
      }

      if (!current) {
        this.select(this.container.child()[this.getRead() - 1], true);
      } else {
        let target = current;

        for (
          let i = 0, end = repeat, asc = 0 <= end;
          asc ? i < end : i > end;
          asc ? i++ : i--
        ) {
          const prevTarget = target;

          let { top: targetTop, height: targetHeight } =
            target.getBoundingClientRect();
          if (0 <= targetTop && target.prev()) {
            target = target.prev();

            while (target && this.isHidden(target)) {
              target = target.prev();
            }
          }

          if (!target) {
            target = prevTarget;
            break;
          }

          ({ top: targetTop, height: targetHeight } =
            target.getBoundingClientRect());
          if (targetTop < 0) {
            if (targetHeight >= containerHeight) {
              this.container.scrollTop -= containerHeight * 0.5;
            } else {
              this.container.scrollTop = target.offsetTop - 10;
            }
          } else if (!target.prev()) {
            this.container.scrollTop -= containerHeight * 0.5;
            if (target === prevTarget) {
              break;
            }
          }
        }

        if (target && target !== current) {
          this.select(target, true);
        }
      }
    }

    /**
    @method addItem
    @param {Object | Array}
    */
    async addItem(items, threadTitle) {
      let res;
      if (!Array.isArray(items)) {
        items = [items];
      }

      if (!(items.length > 0)) {
        return;
      }

      let resNum = this.container.child().length;
      const startResNum = resNum + 1;
      const { bbsType, protocol } = this.url.guessType();
      const writtenRes = await app.WriteHistory.getByUrl(this.urlStr);
      this._threadTitle = threadTitle;

      const $fragment = $_F();

      this.model.title = threadTitle;
      this.model.addItems(items);

      for (let i = startResNum; i <= this.model.resData.size; i++) {
        const res = this.model.getRes(i);
        if (!res) continue;

        const parts = MessageProcessor.decode(res, protocol);

        const $article = $__("article");
        const $header = $__("header");

        //.num
        const $num = $__("span").addClass("num");
        $num.textContent = res.num;
        $header.addLast($num);

        //.name
        const $name = $__("span").addClass("name");
        if (parts.isNameAnchor) {
          $name.addClass("name_anchor");
        }
        $name.innerHTML = parts.nameHtml;
        $header.addLast($name);

        //.mail
        const $mail = $__("span").addClass("mail");
        $mail.innerHTML = parts.mailHtml;
        $header.addLast($mail);

        //.other
        const $other = $__("span").addClass("other");
        $other.innerHTML = parts.otherHtml;
        $header.addLast($other);
        $article.addLast($header);

        // Message
        const $message = $__("div").addClass("message");
        $message.innerHTML = parts.messageHtml;
        $article.addLast($message);

        if (res.class && res.class.length > 0) {
          $article.setClass(...res.class);
        }
        if (res.id) $article.dataset.id = res.id;
        if (res.slip) $article.dataset.slip = res.slip;
        if (res.trip) $article.dataset.trip = res.trip;

        if (res.ng) {
          let type = res.ng.type;
          if (res.ng.name) type += ":" + res.ng.name;
          $article.setAttr("ng-type", type);
          if (app.config.isOn("display_ng")) $article.addClass("disp_ng");
        }

        $fragment.addLast($article);
      }

      this.updateFragmentIds($fragment, startResNum);
      this.container.addLast($fragment);
      this.updateIds(this.model.resData.size);

      // 返信数の更新
      this.updateRepCount();

      //サムネイル追加処理
      try {
        await Promise.all(
          Array.from(
            this.container.$$(
              ".message > a:not(.anchor):not(.thumbnail):not(.has_thumbnail):not(.expandedURL):not(.has_expandedURL)",
            ),
          ).map(async (a) => {
            let err, href, link;
            ({ a, link } = await this.checkUrlExpand(a));
            ({ res, err } = app.ImageReplaceDat.replace(link));
            if (err == null) {
              href = res.text;
            } else {
              ({ href } = a);
            }
            let mediaType = app.URL.getExtType(href, {
              audio: app.config.isOn("audio_supported"),
              video: app.config.isOn("audio_supported"),
              oggIsAudio: app.config.isOn("audio_supported_ogg"),
              oggIsVideo: app.config.isOn("video_supported_ogg"),
            });
            if (err == null) {
              if (mediaType == null) {
                mediaType = "image";
              }
            }
            // サムネイルの追加
            if (mediaType) {
              this.addThumbnail(a, href, mediaType, res);
            }
          }),
        );
        // harmImg更新
        this.updateHarmImages();
      } catch (error) {}
    }

    /**
    @method updateId
    @param {String} className
    @param {Map} map
    @param {String} prefix
    */
    updateId({ startRes = 1, endRes, dom }, className, map, prefix) {
      for (let [id, index] of map) {
        const count = index.size;
        let i = 0;
        for (let resNum of index) {
          i++;
          if (
            !(startRes <= resNum) ||
            (!(endRes == null) && !(resNum <= endRes))
          ) {
            continue;
          }
          const ele = dom.child()[resNum - startRes].C(className)[0];
          ele.textContent = `${prefix}${id}(${i}/${count})`;
          if (count >= 5) {
            ele.removeClass("link");
            ele.addClass("freq");
          } else if (count >= 2) {
            ele.addClass("link");
          }
        }
      }
    }

    /**
    @method updateFragmentIds
    */
    updateFragmentIds($fragment, startRes) {
      //id, slip, trip更新
      this.updateId({ startRes, dom: $fragment }, "id", this.model.idIndex, "");
      this.updateId(
        { startRes, dom: $fragment },
        "slip",
        this.model.slipIndex,
        "SLIP:",
      );
      this.updateId(
        { startRes, dom: $fragment },
        "trip",
        this.model.tripIndex,
        "",
      );
    }

    /**
    @method updateIds
    */
    updateIds(endRes) {
      //id, slip, trip更新
      this.updateId(
        { endRes, dom: this.container },
        "id",
        this.model.idIndex,
        "",
      );
      this.updateId(
        { endRes, dom: this.container },
        "slip",
        this.model.slipIndex,
        "SLIP:",
      );
      this.updateId(
        { endRes, dom: this.container },
        "trip",
        this.model.tripIndex,
        "",
      );

      //参照関係再構築
      (() => {
        for (let [resKey, index] of this.model.repIndex) {
          const res = this.container.child()[resKey - 1];
          if (!res) {
            continue;
          }
          //連鎖NG
          if (app.config.isOn("chain_ng") && res.hasClass("ng")) {
            this._chainNG(res);
          }
          //自分に対してのレス
          if (res.hasClass("written")) {
            for (let r of index) {
              this.container.child()[r - 1].addClass("to_written");
            }
          }
        }
      })();
    }

    /**
    @method updateRepCount
    */
    updateRepCount() {
      for (let [resKey, index] of this.model.repIndex) {
        var ele, newFlg;
        const res = this.container.child()[resKey - 1];
        if (!res) {
          continue;
        }
        let resCount = index.size;
        if (
          app.config.isOn("reject_ng_rep") &&
          this.model.repNgIndex.has(resKey)
        ) {
          const ngSet = this.model.repNgIndex.get(resKey);
          if (ngSet) {
            resCount -= ngSet.size;
          }
        }
        if ((ele = res.C("rep")[0])) {
          newFlg = false;
        } else {
          newFlg = true;
          if (resCount > 0) {
            ele = $__("span");
          }
        }
        if (resCount > 0) {
          ele.textContent = `返信 (${resCount})`;
          ele.className = resCount >= 5 ? "rep freq" : "rep link";
          res.dataset.rescount = Array.from(index).join(" ");
          if (newFlg) {
            res.C("other")[0].addLast(document.createTextNode(" "), ele);
          }
        } else if (ele) {
          res.removeAttr("data-rescount");
          ele.remove();
        }
      }
    }

    /**
    @method setNG
    @param {Element} res
    @param {string} ngType
    */
    setNG(resEle, ngType) {
      resEle.addClass("ng");
      if (app.config.isOn("display_ng")) {
        resEle.addClass("disp_ng");
      }
      resEle.setAttr("ng-type", ngType);
      // Logic for repNgIndex is handled in ThreadModel
    }

    /**
    @method _chainNG
    @param {Element} res
    @private
    */
    /**
    @method _chainNG
    @param {Element} resEle
    @private
    */
    _chainNG(resEle) {
      const resNum = +resEle.C("num")[0].textContent;
      // In ThreadContent, this is called after a manual NG or such.
      // But we should rely on model and then sync view.
      this.model._chainNG(resNum);
      this._syncNgView();
    }

    _chainNgById(id) {
      this.model._chainNgById(id);
      this._syncNgView();
    }

    _chainNgBySlip(slip) {
      this.model._chainNgBySlip(slip);
      this._syncNgView();
    }

    _syncNgView() {
      for (const resEle of this.container.$$("article")) {
        const resNum = +resEle.C("num")[0].textContent;
        const res = this.model.getRes(resNum);
        if (!res) continue;

        if (res.ng && !resEle.hasClass("ng")) {
          let type = res.ng.type;
          if (res.ng.name) type += ":" + res.ng.name;
          this.setNG(resEle, type);
        }
      }
    }

    _checkNG(objRes, bbsType) {
      return this.model._checkNG(objRes, bbsType);
    }

    /**
    @method refreshNG
    */
    refreshNG() {
      this.model.refreshNG();

      // NGの解除と再設定
      for (let resEle of this.container.$$("article")) {
        const resNum = +resEle.C("num")[0].textContent;
        const res = this.model.getRes(resNum);
        if (!res) continue;

        resEle.removeClass("ng", "disp_ng");
        resEle.removeAttr("ng-type");

        if (res.ng) {
          let ngType = res.ng.type;
          if (res.ng.name) {
            ngType += ":" + res.ng.name;
          }
          this.setNG(resEle, ngType);
        }
      }

      // 返信数の更新
      this.updateRepCount();
      // harmImg更新
      this.updateHarmImages();
      // 表示更新通知
      this.container.emit(new Event("view_refreshed", { bubbles: true }));
    }

    /**
    @method updateHarmImages
    */
    updateHarmImages() {
      const imageBlur = app.config.isOn("image_blur");
      for (let resNum of this.model.harmImgIndex) {
        const ele = this.container.child()[resNum - 1];
        if (!ele) {
          continue;
        }
        let isBlur = false;
        const repSet = this.model.repIndex.get(resNum);
        if (repSet) {
          for (let rep of repSet) {
            const repEle = this.container.child()[rep - 1];
            if (!repEle) {
              continue;
            }
            if (!repEle.hasClass("has_harm_word")) {
              continue;
            }
            if (repEle.hasClass("ng")) {
              continue;
            }
            isBlur = true;
            break;
          }
        }

        if (isBlur && !ele.hasClass("has_blur_word")) {
          ele.addClass("has_blur_word");
          if (ele.hasClass("has_image") && imageBlur) {
            MediaContainer.setImageBlur(ele, true);
          }
        } else if (!isBlur && ele.hasClass("has_blur_word")) {
          ele.removeClass("has_blur_word");
          if (ele.hasClass("has_image") && imageBlur) {
            MediaContainer.setImageBlur(ele, false);
          }
        }
      }
    }

    /**
    @method addThumbnail
    @param {HTMLAElement} sourceA
    @param {String} thumbnailPath
    @param {String} [mediaType="image"]
    @param {Object} res
    */
    addThumbnail(sourceA, thumbnailPath, mediaType, res) {
      let thumbnailLink, webkitFilter;
      if (mediaType == null) {
        mediaType = "image";
      }
      sourceA.addClass("has_thumbnail");

      const thumbnail = $__("div").addClass("thumbnail");
      thumbnail.setAttr("media-type", mediaType);

      if (["image", "video"].includes(mediaType)) {
        const article = sourceA.closest("article");
        article.addClass("has_image");
        // グロ画像に対するぼかし処理
        if (
          article.hasClass("has_blur_word") &&
          app.config.isOn("image_blur")
        ) {
          thumbnail.addClass("image_blur");
          const v = app.config.get("image_blur_length");
          webkitFilter = `blur(${v}px)`;
        } else {
          webkitFilter = "none";
        }
      }

      switch (mediaType) {
        case "image":
          thumbnailLink = $__("a");
          thumbnailLink.href = app.safeHref(sourceA.href);
          thumbnailLink.target = "_blank";

          var thumbnailImg = $__("img").addClass("image");
          thumbnailImg.src = "/img/dummy_1x1.&[IMG_EXT]";
          thumbnailImg.style.WebkitFilter = webkitFilter;
          thumbnailImg.style.maxWidth = `${app.config.get("image_width")}px`;
          thumbnailImg.style.maxHeight = `${app.config.get("image_height")}px`;
          thumbnailImg.dataset.src = thumbnailPath;
          thumbnailImg.dataset.type = res.type;
          if (res.extract != null) {
            thumbnailImg.dataset.extract = res.extract;
          }
          if (res.extractReferrer != null) {
            thumbnailImg.dataset.extractReferrer = res.extractReferrer;
          }
          if (res.pattern != null) {
            thumbnailImg.dataset.pattern = res.pattern;
          }
          if (res.cookie != null) {
            thumbnailImg.dataset.cookie = res.cookie;
          }
          if (res.cookieReferrer != null) {
            thumbnailImg.dataset.cookieReferrer = res.cookieReferrer;
          }
          if (res.referrer != null) {
            thumbnailImg.dataset.referrer = res.referrer;
          }
          if (res.userAgent != null) {
            thumbnailImg.dataset.userAgent = res.userAgent;
          }
          thumbnailLink.addLast(thumbnailImg);

          var thumbnailFavicon = $__("img").addClass("favicon");
          thumbnailFavicon.src = "/img/dummy_1x1.&[IMG_EXT]";
          thumbnailFavicon.dataset.src = `https://www.google.com/s2/favicons?domain=${sourceA.hostname}`;
          thumbnailFavicon.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
          thumbnailLink.addLast(thumbnailFavicon);
          break;

        case "audio":
        case "video":
          thumbnailLink = $__(mediaType);
          thumbnailLink.src = "";
          thumbnailLink.dataset.src = thumbnailPath;
          thumbnailLink.preload = "metadata";
          switch (mediaType) {
            case "audio":
              thumbnailLink.style.width = `${app.config.get("audio_width")}px`;
              thumbnailLink.controls = true;
              break;
            case "video":
              thumbnailLink.style.WebkitFilter = webkitFilter;
              thumbnailLink.style.maxWidth = `${app.config.get(
                "video_width",
              )}px`;
              thumbnailLink.style.maxHeight = `${app.config.get(
                "video_height",
              )}px`;
              if (app.config.isOn("video_controls")) {
                thumbnailLink.controls = true;
              }
              break;
          }
          break;
      }

      thumbnail.addLast(thumbnailLink);

      // 高さ固定の場合
      if (app.config.isOn("image_height_fix")) {
        let h;
        switch (mediaType) {
          case "image":
            h = parseInt(app.config.get("image_height"));
            break;
          case "video":
            h = parseInt(app.config.get("video_height"));
            break;
          default:
            h = 100; // 最低高
        }
        thumbnail.style.height = `${h}px`;
      }

      // サムネイルをレスの一番下（.messageの最後）に追加
      const messageDiv = sourceA.closest(".message");
      if (messageDiv) {
        messageDiv.addLast($__("br"));
        messageDiv.addLast(thumbnail);
      }
    }

    /**
    @method addExpandedURL
    @param {HTMLAElement} sourceA
    @param {String} finalUrl
    */
    addExpandedURL(sourceA, finalUrl) {
      let expandedURLLink;
      sourceA.addClass("has_expandedURL");

      const expandedURL = $__("div").addClass("expandedURL");
      expandedURL.setAttr("short-url", sourceA.href);
      if (app.config.get("expand_short_url") === "popup") {
        expandedURL.addClass("hide_data");
      }

      if (finalUrl) {
        expandedURLLink = $__("a");
        expandedURLLink.textContent = finalUrl;
        expandedURLLink.href = app.safeHref(finalUrl);
        expandedURLLink.target = "_blank";
        expandedURL.addLast(expandedURLLink);
      } else {
        expandedURL.addClass("expand_error");
        expandedURLLink = null;
      }

      let sib = sourceA;
      while (true) {
        const pre = sib;
        sib = pre.next();
        if (sib == null || sib.tagName === "BR") {
          if (
            __guard__(sib != null ? sib.next() : undefined, (x) =>
              x.hasClass("expandedURL"),
            )
          ) {
            continue;
          }
          pre.addAfter(expandedURL);
          if (!pre.hasClass("expandedURL")) {
            pre.addAfter($__("br"));
          }
          break;
        }
      }
      return expandedURLLink;
    }

    /**
    @method checkUrlExpand
    @param {HTMLAnchorElement} a
    */
    async checkUrlExpand(a) {
      if (
        app.config.get("expand_short_url") !== "none" &&
        app.URL.SHORT_URL_LIST.has(a.hostname)
      ) {
        // 短縮URLの展開
        const finalUrl = await app.URL.expandShortURL(a.href);
        const newLink = this.addExpandedURL(a, finalUrl);
        if (finalUrl) {
          return { a, link: newLink.href };
        }
      }
      return { a, link: a.href };
    }

    /**
    @method addClassWithOrg
    @param {Element} $res
    @param {String} className
    */
    addClassWithOrg($res, className) {
      $res.addClass(className);
      const resnum = parseInt($res.C("num")[0].textContent);
      this.container.child()[resnum - 1].addClass(className);
    }

    /**
    @method removeClassWithOrg
    @param {Element} $res
    @param {String} className
    */
    removeClassWithOrg($res, className) {
      $res.removeClass(className);
      const resnum = parseInt($res.C("num")[0].textContent);
      this.container.child()[resnum - 1].removeClass(className);
    }

    /**
    @method addWriteHistory
    @param {Element} $res
    */
    addWriteHistory($res) {
      const date = app.util
        .stringToDate($res.C("other")[0].textContent)
        .valueOf();
      if (date != null) {
        app.WriteHistory.add({
          url: this.urlStr,
          res: parseInt($res.C("num")[0].textContent),
          title: document.title,
          name: $res.C("name")[0].textContent,
          mail: $res.C("mail")[0].textContent,
          message: $res.C("message")[0].textContent,
          date,
        });
      }
    }

    /**
    @method removeWriteHistory
    @param {Element} $res
    */
    removeWriteHistory($res) {
      const resnum = parseInt($res.C("num")[0].textContent);
      app.WriteHistory.remove(this.urlStr, resnum);
    }
  };
  ThreadContent.initClass();
  return ThreadContent;
})();

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
