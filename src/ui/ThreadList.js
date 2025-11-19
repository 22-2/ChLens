let ThreadList;
import ContextMenu from "./ContextMenu.js";
import TableSearch from "./TableSearch.js";

// 背景色プリセット
const BG_COLOR_PRESETS = {
  yellow: "#ffeb3b",      // 黄色 (警告・注目)
  blue: "#e3f2fd",        // 青 (情報)
  green: "#c8e6c9",       // 緑 (成功・OK)
  red: "#ffcdd2",         // 赤 (重要・緊急)
  purple: "#e1bee7",      // 紫 (特別)
  orange: "#ffe0b2",      // オレンジ (注意)
  pink: "#f8bbd0",        // ピンク (お気に入り)
  cyan: "#b2ebf2",        // シアン (クール)
  lime: "#f0f4c3",        // ライム (軽い注目)
  amber: "#ffecb3",       // アンバー (中程度の注意)
};

/**
@class ThreadList
@constructor
@param {Element} table
@param {Object} option
  @param {Boolean} [option.bookmark=false]
  @param {Boolean} [option.title=false]
  @param {Boolean} [option.boardTitle=false]
  @param {Boolean} [option.res=false]
  @param {Boolean} [option.unread=false]
  @param {Boolean} [option.heat=false]
  @param {Boolean} [option.createdDate=false]
  @param {Boolean} [option.viewedDate=false]
  @param {Boolean} [option.bookmarkAddRm=false]
  @param {Element} [option.searchbox]
*/
export default ThreadList = (function () {
  ThreadList = class ThreadList {
    static initClass() {
      /**
      @method _dateToString
      @static
      @private
      @param {Date}
      @return {String}
      */
      this._dateToString = (function () {
        const fn = (a) => (a < 10 ? "0" : "") + a;
        return (date) =>
          date.getFullYear() +
          "/" +
          fn(date.getMonth() + 1) +
          "/" +
          fn(date.getDate()) +
          " " +
          fn(date.getHours()) +
          ":" +
          fn(date.getMinutes());
      })();
    }
    constructor(table, option) {
      /**
      @property _flg
      @type Object
      @private
      */
      this.table = table;
      this._flg = {
        bookmark: false,
        title: false,
        boardTitle: false,
        res: false,
        writtenRes: false,
        unread: false,
        heat: false,
        name: false,
        mail: false,
        message: false,
        createdDate: false,
        viewedDate: false,
        writtenDate: false,

        bookmarkAddRm: !!option.bookmarkAddRm,
        searchbox: undefined,
      };

      const keyToLabel = {
        bookmark: "★",
        title: "タイトル",
        boardTitle: "板名",
        res: "レス数",
        writtenRes: "レス番号",
        unread: "未読数",
        heat: "勢い",
        name: "名前",
        mail: "メール",
        message: "本文",
        createdDate: "作成日時",
        viewedDate: "閲覧日時",
        writtenDate: "書込日時",
      };

      const $table = this.table;
      const threadListInstance = this;
      const $thead = $__("thead");
      $table.addLast($thead, $__("tbody"));
      let $tr = $__("tr");
      $thead.addLast($tr);

      //カスタムツールチップ用の要素を作成
      const $tooltip = $__("div").addClass("thread_list_tooltip");
      document.body.appendChild($tooltip);
      let tooltipTimeout = null;

      const renderTooltipContent = ($cell) => {
        const $tr = $cell.closest("tr");
        if (!$tr) {
          return null;
        }

        let text = "";
        if ($tr.dataset.title) {
          text = $tr.dataset.title;
        } else {
          text = $cell.textContent;
        }

        if (!text || !text.trim()) {
          return null;
        }

        $tooltip.textContent = "";

        const $title = $__("div").addClass("thread_list_tooltip_title");
        $title.textContent = text.trim();
        $tooltip.addLast($title);

        const metaParts = [];
        const resText =
          $tr.dataset.resCount ||
          (threadListInstance._flg.res && selector.res
            ? __guard__($tr.$(selector.res), (x) => (x.textContent || "").trim())
            : "");
        if (resText) {
          metaParts.push(`レス数: ${resText}`);
        }

        const heatText =
          $tr.dataset.heat ||
          (threadListInstance._flg.heat && selector.heat
            ? __guard__($tr.$(selector.heat), (x1) => (x1.textContent || "").trim())
            : "");
        if (heatText) {
          metaParts.push(`勢い: ${heatText}`);
        }

        if (metaParts.length > 0) {
          const $meta = $__("div").addClass("thread_list_tooltip_meta");
          $meta.textContent = metaParts.join(" / ");
          $tooltip.addLast($meta);
        }

        return $tr;
      };

      const positionTooltip = ($tr) => {
        const rowRect = $tr.getBoundingClientRect();
        const margin = 4;
        let left = rowRect.left;
        let top = rowRect.bottom + margin;

        $tooltip.style.left = left + "px";
        $tooltip.style.top = top + "px";

        const tooltipRect = $tooltip.getBoundingClientRect();
        const viewportPadding = 8;

        if (tooltipRect.right > window.innerWidth - viewportPadding) {
          left = Math.max(
            viewportPadding,
            window.innerWidth - tooltipRect.width - viewportPadding
          );
          $tooltip.style.left = left + "px";
        }
        if (tooltipRect.left < viewportPadding) {
          $tooltip.style.left = viewportPadding + "px";
        }

        if (tooltipRect.bottom > window.innerHeight - viewportPadding) {
          top = Math.max(
            viewportPadding,
            window.innerHeight - tooltipRect.height - viewportPadding
          );
          $tooltip.style.top = top + "px";
        }
      };

      //項目のカスタムツールチップ表示
      $table.on(
        "mouseenter",
        function (e) {
          const { target } = e;
          if (target.tagName === "TD") {
            clearTimeout(tooltipTimeout);

            const $tr = renderTooltipContent(target);
            if (!$tr) {
              return;
            }
            positionTooltip($tr);
            $tooltip.addClass("visible");
          }
        },
        true
      );
      $table.on(
        "mouseleave",
        function ({ target }) {
          if (target.tagName === "TD") {
            tooltipTimeout = setTimeout(() => {
              $tooltip.removeClass("visible");
            }, 100);
          }
        },
        true
      );

      const $cols = $_F();
      const selector = {};
      const column = {};
      let i = 0;
      for (let key in keyToLabel) {
        const val = keyToLabel[key];
        if (option.th.includes(key)) {
          i++;
          const className = key.replace(
            /([A-Z])/g,
            ($0, $1) => "_" + $1.toLowerCase()
          );
          const $th = $__("th").addClass(className);
          $th.textContent = val;
          $th.dataset.key = className;
          $tr.addLast($th);
          this._flg[key] = true;
          selector[key] = `td:nth-child(${i})`;
          column[key] = i;
          const $col = $__("col").addClass(className);
          $col.span = 1;
          $cols.addLast($col);
        }
      }
      $table.addFirst($cols);

      //ブックマーク更新時処理
      app.message.on("bookmark_updated", async ({ type, bookmark }) => {
        let url;
        if (bookmark.type !== "thread") {
          return;
        }

        if (type === "expired") {
          $tr = $table.$(`tr[data-href=\"${bookmark.url}\"]`);
          if ($tr != null) {
            if (bookmark.expired) {
              $tr.addClass("expired");
              if (app.config.isOn("bookmark_show_dat")) {
                $tr.removeClass("hidden");
              } else {
                $tr.addClass("hidden");
              }
            } else {
              $tr.removeClass("expired");
            }
          }
        }

        if (type === "errored") {
          $tr = $table.$(`tr[data-href=\"${bookmark.url}\"]`);
          if ($tr != null) {
            $tr.addClass("errored");
          }
        }

        if (type === "updated") {
          $tr = $table.$(`tr[data-href=\"${bookmark.url}\"]`);
          if ($tr != null) {
            $tr.removeClass("errored");
          }
        }

        if (this._flg.bookmark) {
          if (type === "added") {
            $tr = $table.$(`tr[data-href=\"${bookmark.url}\"]`);
            if ($tr != null) {
              $tr.$(selector.bookmark).textContent = "★";
            }
          } else if (type === "removed") {
            $tr = $table.$(`tr[data-href=\"${bookmark.url}\"]`);
            if ($tr != null) {
              $tr.$(selector.bookmark).textContent = "";
            }
          }
        }

        if (this._flg.bookmarkAddRm) {
          if (type === "added") {
            let boardTitle;
            url = new app.URL.URL(bookmark.url);
            const boardUrl = url.toBoard();
            try {
              boardTitle = await app.BoardTitleSolver.ask(boardUrl);
            } catch (error) {
              boardTitle = "";
            }
            this.addItem({
              title: bookmark.title,
              url: bookmark.url,
              resCount: bookmark.resCount || 0,
              readState: bookmark.readState || null,
              createdAt: /\/(\d+)\/$/.exec(url.pathname)[1] * 1000,
              boardUrl: boardUrl.href,
              boardTitle,
              expired: bookmark.expired,
              isHttps: url.isHttps(),
            });
          } else if (type === "removed") {
            $table.$(`tr[data-href=\"${bookmark.url}\"]`).remove();
          }
        }

        if (type === "res_count") {
          const tr = $table.$(`tr[data-href="${bookmark.url}"]`);
          if (tr) {
            const created = /\/(\d+)\/$/.exec(bookmark.url)[1] * 1000;
            const heatValue = ThreadList._calcHeat(
              Date.now(),
              created,
              bookmark.resCount
            );
            tr.dataset.resCount = "" + bookmark.resCount;
            tr.dataset.heat = heatValue;

            if (this._flg.res) {
              let td = tr.$(selector.res);
              const oldResCount = +td.textContent;
              td.textContent = bookmark.resCount;
              td.dataset.beforeres = oldResCount;
              if (this._flg.unread) {
                td = tr.$(selector.unread);
                const oldUnread = +td.textContent;
                const unread = oldUnread + (bookmark.resCount - oldResCount);
                td.textContent = unread || "";
                if (unread > 0) {
                  tr.addClass("updated");
                } else {
                  tr.removeClass("updated");
                }
              }
              if (this._flg.heat) {
                td = tr.$(selector.heat);
                td.textContent = heatValue;
              }
            } else if (this._flg.heat) {
              const heatCell = tr.$(selector.heat);
              if (heatCell) {
                heatCell.textContent = heatValue;
              }
            }
          }
        }

        if (this._flg.title && type === "title") {
          $tr = $table.$(`tr[data-href=\"${bookmark.url}\"]`);
          if ($tr != null) {
            $tr.$(selector.title).textContent = bookmark.title;
          }
        }
      });

      //未読数更新
      if (this._flg.unread) {
        app.message.on("read_state_updated", function ({ read_state }) {
          const tr = $table.$(`tr[data-href=\"${read_state.url}\"]`);
          if (tr) {
            const res = tr.$(selector.res);
            if (+res.textContent < read_state.received) {
              res.textContent = read_state.received;
              tr.dataset.resCount = "" + read_state.received;
            }
            const unread = tr.$(selector.unread);
            const unreadCount = Math.max(+res.textContent - read_state.read, 0);
            unread.textContent = unreadCount || "";
            if (unreadCount > 0) {
              tr.addClass("updated");
            } else {
              tr.removeClass("updated");
            }
          }
        });

        app.message.on("read_state_removed", function ({ url }) {
          const tr = $table.$(`tr[data-href=\"${url}\"]`);
          if (tr) {
            tr.$(selector.unread).textContent = "";
            tr.removeClass("updated");
          }
        });
      }

      //リスト内検索
      if (typeof option.searchbox === "object") {
        const $searchColumn = option.searchColumn;
        const $searchbox = option.searchbox;

        $searchbox.on("compositionend", function () {
          this.emit(new Event("input"));
        });
        $searchbox.on("input", function ({ isComposing }) {
          let dom;
          if (isComposing) {
            return;
          }
          if (this.value !== "") {
            TableSearch($table, "search", {
              query: this.value,
              target_col: $searchColumn.selectedOptions[0].dataset.searchIndex,
            });
            const hitCount = $table.dataset.tableSearchHitCount;
            for (dom of this.parent().child()) {
              if (dom.hasClass("hit_count")) {
                dom.textContent = hitCount + "hit";
              }
            }
          } else {
            TableSearch($table, "clear");
            for (dom of this.parent().child()) {
              if (dom.hasClass("hit_count")) {
                dom.textContent = "";
              }
            }
          }
        });
        $searchbox.on("keyup", function ({ key }) {
          if (key === "Escape") {
            this.value = "";
            this.emit(new Event("input"));
          }
        });
        $searchColumn.on("change", function () {
          $searchbox.emit(new Event("input"));
        });
      }

      //コンテキストメニュー
      if (
        this._flg.bookmark ||
        this._flg.bookmarkAddRm ||
        this._flg.writtenRes ||
        this._flg.viewedDate
      ) {
        (() => {
          return $table.on("contextmenu", async (e) => {
            let fn;
            $tr = e.target.closest("tbody > tr");
            if (!$tr) {
              return;
            }
            e.preventDefault();

            await app.defer();
            const $menu = $$.I("template_thread_list_contextmenu")
              .content.$(".thread_list_contextmenu")
              .cloneNode(true);
            $table.closest(".view").addLast($menu);

            const url = $tr.dataset.href;

            if (app.bookmark.get(url)) {
              __guard__($menu.C("add_bookmark")[0], (x) => x.remove());
            } else {
              __guard__($menu.C("del_bookmark")[0], (x1) => x1.remove());
            }

            if (
              !this._flg.unread ||
              !/^\d+$/.test($tr.$(selector.unread).textContent) ||
              app.bookmark.get(url) != null
            ) {
              __guard__($menu.C("del_read_state")[0], (x2) => x2.remove());
            }

            $menu.on(
              "click",
              (fn = function ({ target }) {
                let left, left1;
                if (target.tagName !== "LI") {
                  return;
                }
                $menu.off("click", fn);

                if ($tr == null) {
                  return;
                }

                const threadURL = $tr.dataset.href;
                const threadTitle = __guard__(
                  $tr.$(selector.title),
                  (x3) => x3.textContent
                );
                const threadRes = parseInt(
                  (left = __guard__(
                    $tr.$(selector.res),
                    (x4) => x4.textContent
                  )) != null
                    ? left
                    : 0
                );
                const threadWrittenRes = parseInt(
                  (left1 = __guard__(
                    $tr.$(selector.writtenRes),
                    (x5) => x5.textContent
                  )) != null
                    ? left1
                    : 0
                );
                const dateValue = __guard__($tr.$(selector.viewedDate), (x6) =>
                  x6.getAttr("date-value")
                );

                switch (false) {
                  case !target.hasClass("add_bookmark"):
                    app.bookmark.add(threadURL, threadTitle, threadRes);
                    break;
                  case !target.hasClass("del_bookmark"):
                    app.bookmark.remove(threadURL);
                    break;
                  case !target.hasClass("del_history"):
                    app.History.remove(threadURL, +dateValue);
                    $tr.remove();
                    break;
                  case !target.hasClass("del_writehistory"):
                    app.WriteHistory.remove(threadURL, threadWrittenRes);
                    $tr.remove();
                    break;
                  case !target.hasClass("ignore_res_number"):
                    $tr.setAttr("ignore-res-number", "on");
                    $tr.emit(new Event("mousedown", { bubbles: true }));
                    break;
                  case !target.hasClass("del_read_state"):
                    app.ReadState.remove(threadURL);
                    break;
                }

                this.remove();
              })
            );
            ContextMenu($menu, e.clientX, e.clientY);
          });
        })();
        return;
      }
    }

    /**
    @method _calcHeat
    @static
    @private
    @param {Number} now
    @param {Number} created
    @param {Number} resCount
    @return {String}
    */
    static _calcHeat(now, created, resCount) {
      if (!/^\d+$/.test(created)) {
        created = new Date(created).getTime();
      }
      if (created > now) {
        return "0.0";
      }
      const elapsed = Math.max((now - created) / 1000, 1) / (24 * 60 * 60);
      return (resCount / elapsed).toFixed(1);
    }

    /**
    @method addItem
    @param {Object|Array}
    */
    addItem(arg) {
      if (!Array.isArray(arg)) {
        arg = [arg];
      }

      const $tbody = this.table.$("tbody");
      const now = Date.now();

      const $fragment = $_F();

      for (let item of arg) {
        var $td;
        const $tr = $__("tr").addClass("open_in_rcrx");

        $tr.dataset.href = app.escapeHtml(item.url);

        // matchLabelがある場合はタイトルに含める
        let titleWithLabel = item.title;
        if (item.highlight && item.highlight.params && item.highlight.params.label) {
          titleWithLabel = `【${item.highlight.params.label}】${item.title}`;
        }
        $tr.dataset.title = app.escapeHtml(titleWithLabel);

        if (item.expired) {
          $tr.addClass("expired");
        }
        if (item.ng) {
          $tr.addClass("ng_thread");
        }
        if (item.highlight) {
          $tr.addClass("highlight");
          // bgColorが指定されている場合は背景色を設定
          if (item.highlight.params && item.highlight.params.bgColor) {
            let bgColor = item.highlight.params.bgColor;
            // プリセット名の場合は色コードに変換
            if (BG_COLOR_PRESETS[bgColor]) {
              bgColor = BG_COLOR_PRESETS[bgColor];
            }
            $tr.style.backgroundColor = bgColor;
          }
        }
        if (item.isNet) {
          $tr.addClass("net");
        }
        if (item.isHttps) {
          $tr.addClass("https");
        }

        if (item.expired && !app.config.isOn("bookmark_show_dat")) {
          $tr.addClass("hidden");
        }

        if (item.threadNumber != null) {
          $tr.dataset.threadNumber = app.escapeHtml("" + item.threadNumber);
        }
        if (this._flg.writtenRes && item.res > 0) {
          $tr.dataset.writtenResNum = item.res;
        }

        const resCount =
          typeof item.resCount === "number" && !Number.isNaN(item.resCount)
            ? item.resCount
            : 0;
        $tr.dataset.resCount = "" + resCount;
        const rowHeat = ThreadList._calcHeat(now, item.createdAt, resCount);
        if (rowHeat != null) {
          $tr.dataset.heat = rowHeat;
        }

        //ブックマーク状況
        if (this._flg.bookmark) {
          $td = $__("td");
          if (app.bookmark.get(item.url)) {
            $td.textContent = "★";
          }
          $tr.addLast($td);
        }

        //タイトル
        if (this._flg.title) {
          $td = $__("td");
          $td.textContent = item.title;
          $tr.addLast($td);
        }

        //板名
        if (this._flg.boardTitle) {
          $td = $__("td");
          $td.textContent = item.boardTitle;
          $tr.addLast($td);
        }

        //レス数
        if (this._flg.res) {
          $td = $__("td");
          if (item.resCount > 0) {
            $td.textContent = item.resCount;
          }
          $tr.addLast($td);
        }

        //レス番号
        if (this._flg.writtenRes) {
          $td = $__("td");
          if (item.res > 0) {
            $td.textContent = item.res;
          }
          $tr.addLast($td);
        }

        //未読数
        if (this._flg.unread) {
          $td = $__("td");
          if (item.readState && item.resCount > item.readState.read) {
            $td.textContent = item.resCount - item.readState.read;
            $tr.addClass("updated");
          }
          $tr.addLast($td);
        }

        //勢い
        if (this._flg.heat) {
          $td = $__("td");
          $td.textContent = rowHeat;
          $tr.addLast($td);
        }

        //名前
        if (this._flg.name) {
          $td = $__("td");
          $td.textContent = item.name;
          $tr.addLast($td);
        }

        //メール
        if (this._flg.mail) {
          $td = $__("td");
          $td.textContent = item.mail;
          $tr.addLast($td);
        }

        //本文
        if (this._flg.message) {
          $td = $__("td");
          $td.textContent = item.message;
          $tr.addLast($td);
        }

        //作成日時
        if (this._flg.createdDate) {
          $td = $__("td");
          $td.textContent = ThreadList._dateToString(new Date(item.createdAt));
          $tr.addLast($td);
        }

        //閲覧日時
        if (this._flg.viewedDate) {
          $td = $__("td");
          $td.setAttr("date-value", item.date);
          $td.textContent = ThreadList._dateToString(new Date(item.date));
          $tr.addLast($td);
        }

        //書込日時
        if (this._flg.writtenDate) {
          $td = $__("td");
          $td.textContent = ThreadList._dateToString(new Date(item.date));
          $tr.addLast($td);
        }

        $fragment.addLast($tr);
      }

      $tbody.addLast($fragment);
    }

    /**
    @method empty
    */
    empty() {
      this.table.$("tbody").innerHTML = "";
    }

    /**
    @method getSelected
    @return {Element|null}
    */
    getSelected() {
      return this.table.$("tr.selected");
    }

    /**
    @method select
    @param {Element|number} tr
    */
    select(target) {
      this.clearSelect();

      if (typeof target === "number") {
        target = this.table.$(
          `tbody > tr:nth-child(${target}), tbody > tr:last-child`
        );
      }

      if (!target) {
        return;
      }

      target.addClass("selected");
      target.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "center",
      });
    }

    /**
    @method selectNext
    @param {number} [repeat = 1]
    */
    selectNext(repeat) {
      if (repeat == null) {
        repeat = 1;
      }
      let current = this.getSelected();

      if (current) {
        for (
          let i = 0, end = repeat, asc = 0 <= end;
          asc ? i < end : i > end;
          asc ? i++ : i--
        ) {
          const prevCurrent = current;
          current = current.next();

          while (current && current.offsetHeight === 0) {
            current = current.next();
          }

          if (!current) {
            current = prevCurrent;
            break;
          }
        }
      } else {
        current = this.table.$("tbody > tr");
      }

      if (current) {
        this.select(current);
      }
    }

    /**
    @method selectPrev
    @param {number} [repeat = 1]
    */
    selectPrev(repeat) {
      if (repeat == null) {
        repeat = 1;
      }
      let current = this.getSelected();

      if (current) {
        for (
          let i = 0, end = repeat, asc = 0 <= end;
          asc ? i < end : i > end;
          asc ? i++ : i--
        ) {
          const prevCurrent = current;
          current = current.prev();

          while (current && current.offsetHeight === 0) {
            current = current.prev();
          }

          if (!current) {
            current = prevCurrent;
            break;
          }
        }
      } else {
        current = this.table.$("tbody > tr");
      }

      if (current) {
        this.select(current);
      }
    }

    /**
    @method clearSelect
    */
    clearSelect() {
      __guard__(this.getSelected(), (x) => x.removeClass("selected"));
    }
  };
  ThreadList.initClass();
  return ThreadList;
})();

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
