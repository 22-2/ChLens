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

const COLUMN_DEFINITIONS = {
  bookmark: { label: "★", minWidth: 36 },
  title: { label: "タイトル", minWidth: 160 },
  boardTitle: { label: "板名", minWidth: 120 },
  res: { label: "レス数", minWidth: 70 },
  writtenRes: { label: "レス番号", minWidth: 70 },
  unread: { label: "未読数", minWidth: 70 },
  heat: { label: "勢い", minWidth: 80 },
  name: { label: "名前", minWidth: 120 },
  mail: { label: "メール", minWidth: 120 },
  message: { label: "本文", minWidth: 160 },
  createdDate: { label: "作成日時", minWidth: 160 },
  viewedDate: { label: "閲覧日時", minWidth: 160 },
  writtenDate: { label: "書込日時", minWidth: 160 },
};

const COLUMN_PREF_VERSION = 1;
const COLUMN_MAX_WIDTH = 640;
const DEFAULT_MIN_WIDTH = 48;

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

    static _loadColumnPreferences(key) {
      if (!key) {
        return { version: COLUMN_PREF_VERSION, columns: {} };
      }
      try {
        const stored = app.config.get(key);
        if (!stored) {
          return { version: COLUMN_PREF_VERSION, columns: {} };
        }
        const parsed = JSON.parse(stored);
        if (
          parsed &&
          typeof parsed === "object" &&
          parsed.version === COLUMN_PREF_VERSION &&
          typeof parsed.columns === "object"
        ) {
          return parsed;
        }
      } catch (error) {}
      return { version: COLUMN_PREF_VERSION, columns: {} };
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
      };

      this._columns = {};
      this._columnOrder = [];
      this._columnPreferencesKey = option.columnPreferencesKey || null;
      this._columnPreferences = this._columnPreferencesKey
        ? ThreadList._loadColumnPreferences(this._columnPreferencesKey)
        : { version: COLUMN_PREF_VERSION, columns: {} };
      this._singleColumnState = null;

      const columnDefinitions = COLUMN_DEFINITIONS;

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
      let i = 0;
      for (let key in columnDefinitions) {
        const definition = columnDefinitions[key];
        if (!definition) {
          continue;
        }
        const val = definition.label;
        if (option.th.includes(key)) {
          i++;
          const className = key.replace(
            /([A-Z])/g,
            ($0, $1) => "_" + $1.toLowerCase()
          );
          const $th = $__("th").addClass(className);
          $th.dataset.key = className;
          $th.dataset.columnKey = key;
          const $label = $__("span").addClass("column_label");
          $label.addClass(`column_label_${className}`);
          $label.dataset.columnKey = key;
          $label.textContent = val;
          $th.textContent = "";
          $th.addLast($label);
          if (this._columnPreferencesKey) {
            const $handle = $__("span").addClass("column_resize_handle");
            $handle.dataset.columnKey = key;
            $th.addLast($handle);
          }
          $tr.addLast($th);
          this._flg[key] = true;
          selector[key] = `td:nth-child(${i})`;
          const $col = $__("col").addClass(className);
          $col.span = 1;
          $cols.addLast($col);
          this._columns[key] = {
            key,
            className,
            th: $th,
            col: $col,
            minWidth: definition.minWidth || DEFAULT_MIN_WIDTH,
            maxWidth: definition.maxWidth || COLUMN_MAX_WIDTH,
            canHide: definition.canHide !== false,
            width: null,
            hidden: false,
            label: definition.label,
          };
          this._columnOrder.push(key);
        }
      }
      $table.addFirst($cols);

      if (this._columnPreferencesKey) {
        this.table.addClass("thread_list_resizable");
        this._applyStoredColumnPreferences();
        this._setupColumnResizeHandles();
      }

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
                  case !target.hasClass("copy_thread_title"):
                    (async () => {
                      try {
                        const text = threadTitle || "";
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          await navigator.clipboard.writeText(text);
                        } else {
                          const ta = document.createElement("textarea");
                          ta.value = text;
                          ta.style.position = "fixed";
                          ta.style.opacity = "0";
                          document.body.appendChild(ta);
                          ta.focus();
                          ta.select();
                          document.execCommand("copy");
                          ta.remove();
                        }
                      } catch (error) {
                        // ignore
                      }
                    })();
                    break;
                  case !target.hasClass("copy_thread_url"):
                    (async () => {
                      try {
                        const text = threadURL || "";
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          await navigator.clipboard.writeText(text);
                        } else {
                          const ta = document.createElement("textarea");
                          ta.value = text;
                          ta.style.position = "fixed";
                          ta.style.opacity = "0";
                          document.body.appendChild(ta);
                          ta.focus();
                          ta.select();
                          document.execCommand("copy");
                          ta.remove();
                        }
                      } catch (error) {
                        // ignore
                      }
                    })();
                    break;
                  case !target.hasClass("copy_thread_title_and_url"):
                    (async () => {
                      try {
                        const text = (threadTitle || "") + " " + (threadURL || "");
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          await navigator.clipboard.writeText(text);
                        } else {
                          const ta = document.createElement("textarea");
                          ta.value = text;
                          ta.style.position = "fixed";
                          ta.style.opacity = "0";
                          document.body.appendChild(ta);
                          ta.focus();
                          ta.select();
                          document.execCommand("copy");
                          ta.remove();
                        }
                      } catch (error) {
                        // ignore
                      }
                    })();
                    break;
                    case !target.hasClass("button_popout"):
                      (function () {
                        const popupUrl = `/view/thread.html?${app.URL.buildQuery({ q: threadURL })}`;
                        if (typeof browser !== "undefined" && browser.windows) {
                          browser.windows.create({
                            url: popupUrl,
                            type: "popup",
                            width: 800,
                            height: 600,
                          });
                        } else {
                          open(popupUrl, "_blank", "width=800,height=600");
                        }
                      })();
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

    _applyStoredColumnPreferences() {
      const prefs = this._columnPreferences.columns || {};
      let hasVisible = false;
      for (const key of this._columnOrder) {
        const column = this._columns[key];
        if (!column) {
          continue;
        }
        const saved = prefs[key];
        if (saved) {
          if (typeof saved.width === "number") {
            column.width = saved.width;
          }
          if (saved.hidden !== undefined) {
            column.hidden = !!saved.hidden;
          }
        }
        if (!column.hidden) hasVisible = true;

        if (column.hidden) {
          column.th.addClass("column_hidden");
          column.col.addClass("column_hidden");
        } else {
          column.th.removeClass("column_hidden");
          column.col.removeClass("column_hidden");
        }
        this._applyColumnWidth(key);
      }
      if (!hasVisible) {
        this._ensureAtLeastOneVisibleColumn();
      } else {
        this._updateSingleColumnMode();
      }
    }

    _applyColumnWidth(key) {
      const column = this._columns[key];
      if (!column) {
        return;
      }
      if (column.hidden) {
        column.col.style.width = "0px";
        column.th.style.width = "0px";
        return;
      }
      if (typeof column.width === "number" && Number.isFinite(column.width)) {
        const minWidth = column.minWidth || DEFAULT_MIN_WIDTH;
        const maxWidth = column.maxWidth || COLUMN_MAX_WIDTH;
        const width = Math.max(minWidth, Math.min(column.width, maxWidth));
        column.width = width;
        column.col.style.width = width + "px";
        column.th.style.width = width + "px";
      } else {
        column.col.style.width = "";
        column.th.style.width = "";
      }
    }

    _ensureAtLeastOneVisibleColumn() {
      const visible = this._columnOrder.filter(
        (key) => this._columns[key] && !this._columns[key].hidden
      );
      if (!visible.length && this._columnOrder.length > 0) {
        const fallback = this._columns[this._columnOrder[0]];
        if (fallback) {
          fallback.hidden = false;
          fallback.th.removeClass("column_hidden");
          fallback.col.removeClass("column_hidden");
          this._applyColumnWidth(fallback.key);
          this._updateColumnCells(fallback.key);
        }
      }
      this._updateSingleColumnMode();
    }

    _setupColumnResizeHandles() {
      this.table.on(
        "pointerdown",
        (event) => {
          const { target } = event;
          if (!target || !target.hasClass || !target.hasClass("column_resize_handle")) {
            return;
          }
          const { columnKey } = target.dataset || {};
          if (!columnKey) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          this._startColumnResize(target, columnKey, event);
        },
        true
      );
    }

    _startColumnResize(handle, key, event) {
      const column = this._columns[key];
      if (!column || column.hidden) {
        return;
      }
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startWidth = column.th.getBoundingClientRect().width;
      if (handle.addClass) {
        handle.addClass("active");
      }
      if (handle.setPointerCapture) {
        try {
          handle.setPointerCapture(pointerId);
        } catch (error) {}
      }
      document.body.style.cursor = "col-resize";
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const delta = moveEvent.clientX - startX;
        this.setColumnWidth(key, startWidth + delta, {
          persist: false,
          silent: true,
        });
      };
      const stop = (endEvent) => {
        if (endEvent.pointerId !== pointerId) {
          return;
        }
        document.body.style.cursor = "";
        if (handle.removeClass) {
          handle.removeClass("active");
        }
        if (handle.releasePointerCapture) {
          try {
            handle.releasePointerCapture(pointerId);
          } catch (error) {}
        }
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        this._updateColumnPrefs(key);
        this._notifyColumnState();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    }

    _markCell($td, key) {
      if (!$td || !this._columns[key]) {
        return;
      }
      $td.dataset.columnKey = key;
      if (this._columns[key].hidden) {
        $td.addClass("column_hidden");
      } else {
        $td.removeClass("column_hidden");
      }
    }

    _updateColumnCells(key) {
      for (let cell of this.table.$$(`td[data-column-key="${key}"]`)) {
        if (this._columns[key].hidden) {
          cell.addClass("column_hidden");
        } else {
          cell.removeClass("column_hidden");
        }
      }
    }

    _updateColumnPrefs(key) {
      if (!this._columnPreferencesKey) {
        return;
      }
      if (
        !this._columnPreferences ||
        this._columnPreferences.version !== COLUMN_PREF_VERSION
      ) {
        this._columnPreferences = {
          version: COLUMN_PREF_VERSION,
          columns: {},
        };
      }
      const prefs = this._columnPreferences.columns;
      const column = this._columns[key];
      if (!column) {
        return;
      }
      const entry = prefs[key] || {};
      if (column.hidden) {
        entry.hidden = true;
      } else {
        delete entry.hidden;
      }
      if (typeof column.width === "number" && Number.isFinite(column.width)) {
        entry.width = Math.round(column.width);
      } else {
        delete entry.width;
      }
      if (Object.keys(entry).length === 0) {
        delete prefs[key];
      } else {
        prefs[key] = entry;
      }
      this._persistColumnPrefs();
    }

    _persistColumnPrefs() {
      if (!this._columnPreferencesKey) {
        return;
      }
      app.config.set(
        this._columnPreferencesKey,
        JSON.stringify(this._columnPreferences)
      );
    }

    _notifyColumnState() {
      if (!this.table || !this.table.emit) {
        return;
      }
      this.table.emit(
        new CustomEvent("threadlist_column_state", {
          detail: { columns: this.getColumnStates() },
        })
      );
    }

    getColumnStates() {
      return this._columnOrder
        .filter((key) => this._columns[key])
        .map((key) => {
          const column = this._columns[key];
          return {
            key,
            label: column.label,
            hidden: !!column.hidden,
            width: column.width,
            minWidth: column.minWidth,
            canHide: column.canHide !== false,
          };
        });
    }

    setColumnVisibility(key, visible) {
      const column = this._columns[key];
      if (!column) {
        return false;
      }
      const shouldShow = visible !== false;
      if (!shouldShow) {
        const otherVisible = this._columnOrder.filter(
          (colKey) =>
            colKey !== key && this._columns[colKey] && !this._columns[colKey].hidden
        );
        if (otherVisible.length === 0) {
          return false;
        }
      }
      column.hidden = !shouldShow;
      column.th.toggleClass("column_hidden", column.hidden);
      column.col.toggleClass("column_hidden", column.hidden);
      this._applyColumnWidth(key);
      this._updateColumnCells(key);
      this._updateColumnPrefs(key);
      this._updateSingleColumnMode();
      this._notifyColumnState();
      return true;
    }

    setColumnWidth(key, width, options = {}) {
      const column = this._columns[key];
      if (!column || column.hidden) {
        return false;
      }
      const { persist = true, silent = false } = options;
      let nextWidth = width;
      if (typeof nextWidth === "number" && Number.isFinite(nextWidth)) {
        const minWidth = column.minWidth || DEFAULT_MIN_WIDTH;
        const maxWidth = column.maxWidth || COLUMN_MAX_WIDTH;
        nextWidth = Math.max(minWidth, Math.min(nextWidth, maxWidth));
      } else {
        nextWidth = null;
      }
      column.width = nextWidth;
      this._applyColumnWidth(key);
      if (persist) {
        this._updateColumnPrefs(key);
      }
      if (!silent) {
        this._notifyColumnState();
      }
      return true;
    }

    resetColumnPreferences() {
      let changed = false;
      for (const key of this._columnOrder) {
        const column = this._columns[key];
        if (!column) {
          continue;
        }
        if (column.hidden) {
          column.hidden = false;
          column.th.removeClass("column_hidden");
          column.col.removeClass("column_hidden");
          changed = true;
        }
        if (column.width != null) {
          column.width = null;
          changed = true;
        }
        this._applyColumnWidth(key);
        this._updateColumnCells(key);
      }
      if (this._columnPreferencesKey) {
        this._columnPreferences = {
          version: COLUMN_PREF_VERSION,
          columns: {},
        };
        this._persistColumnPrefs();
      }
      this._updateSingleColumnMode();
      if (changed) {
        this._notifyColumnState();
      }
    }

    _updateSingleColumnMode() {
      if (!this.table || !this._columnOrder) {
        return;
      }
      const visibleKeys = this._columnOrder.filter(
        (key) => this._columns[key] && !this._columns[key].hidden
      );
      if (visibleKeys.length === 1) {
        const key = visibleKeys[0];
        const column = this._columns[key];
        if (!column) {
          return;
        }
        if (
          !this._singleColumnState ||
          this._singleColumnState.key !== key
        ) {
          this._restoreSingleColumnWidth();
          this._singleColumnState = { key, width: column.width };
        }
        if (column.width != null) {
          column.width = null;
          this._applyColumnWidth(key);
        }
        this.table.addClass("thread_list_single_column");
      } else {
        if (this._singleColumnState) {
          this._restoreSingleColumnWidth();
          this._singleColumnState = null;
        }
        this.table.removeClass("thread_list_single_column");
      }
    }

    _restoreSingleColumnWidth() {
      if (!this._singleColumnState) {
        return;
      }
      const { key, width } = this._singleColumnState;
      const column = this._columns[key];
      if (!column) {
        return;
      }
      column.width = width;
      this._applyColumnWidth(key);
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
          this._markCell($td, "bookmark");
          if (app.bookmark.get(item.url)) {
            $td.textContent = "★";
          }
          $tr.addLast($td);
        }

        //タイトル
        if (this._flg.title) {
          $td = $__("td");
          this._markCell($td, "title");
          $td.textContent = item.title;
          $tr.addLast($td);
        }

        //板名
        if (this._flg.boardTitle) {
          $td = $__("td");
          this._markCell($td, "boardTitle");
          $td.textContent = item.boardTitle;
          $tr.addLast($td);
        }

        //レス数
        if (this._flg.res) {
          $td = $__("td");
          this._markCell($td, "res");
          if (item.resCount > 0) {
            $td.textContent = item.resCount;
          }
          $tr.addLast($td);
        }

        //レス番号
        if (this._flg.writtenRes) {
          $td = $__("td");
          this._markCell($td, "writtenRes");
          if (item.res > 0) {
            $td.textContent = item.res;
          }
          $tr.addLast($td);
        }

        //未読数
        if (this._flg.unread) {
          $td = $__("td");
          this._markCell($td, "unread");
          if (item.readState && item.resCount > item.readState.read) {
            $td.textContent = item.resCount - item.readState.read;
            $tr.addClass("updated");
          }
          $tr.addLast($td);
        }

        //勢い
        if (this._flg.heat) {
          $td = $__("td");
          this._markCell($td, "heat");
          $td.textContent = rowHeat;
          $tr.addLast($td);
        }

        //名前
        if (this._flg.name) {
          $td = $__("td");
          this._markCell($td, "name");
          $td.textContent = item.name;
          $tr.addLast($td);
        }

        //メール
        if (this._flg.mail) {
          $td = $__("td");
          this._markCell($td, "mail");
          $td.textContent = item.mail;
          $tr.addLast($td);
        }

        //本文
        if (this._flg.message) {
          $td = $__("td");
          this._markCell($td, "message");
          $td.textContent = item.message;
          $tr.addLast($td);
        }

        //作成日時
        if (this._flg.createdDate) {
          $td = $__("td");
          this._markCell($td, "createdDate");
          $td.textContent = ThreadList._dateToString(new Date(item.createdAt));
          $tr.addLast($td);
        }

        //閲覧日時
        if (this._flg.viewedDate) {
          $td = $__("td");
          this._markCell($td, "viewedDate");
          $td.setAttr("date-value", item.date);
          $td.textContent = ThreadList._dateToString(new Date(item.date));
          $tr.addLast($td);
        }

        //書込日時
        if (this._flg.writtenDate) {
          $td = $__("td");
          this._markCell($td, "writtenDate");
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
