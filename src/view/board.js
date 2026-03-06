app.boot("/view/board.html", ["Board"], function (Board) {
  let needle, url;
  try {
    url = app.URL.parseQuery(location.search).get("q");
  } catch (error) {
    alert("不正な引数です");
    return;
  }
  url = new app.URL.URL(url);
  const urlStr = url.href;
  const openedAt = Date.now();

  const $view = document.documentElement;
  $view.dataset.url = urlStr;

  const $table = $__("table");
  const threadList = new UI.ThreadList($table, {
    th: ["bookmark", "title", "res", "unread", "heat", "createdDate"],
    searchColumn: $view.C("search_item_selector")[0],
    searchbox: $view.C("searchbox")[0],
    columnPreferencesKey: "board_column_preferences",
  });
  app.DOMData.set($view, "threadList", threadList);
  app.DOMData.set($view, "selectableItemList", threadList);
  const tableSorter = new UI.TableSorter($table);
  app.DOMData.set($table, "tableSorter", tableSorter);
  $$.C("content")[0].addLast($table);

  // 列表示設定メニュー
  (function () {
    const $menuList = $view.C("column_toggle_list")[0];
    const $resetBtn = $view.C("column_menu_reset")[0];

    if (!$menuList) return;

    const updateMenu = () => {
      $menuList.textContent = "";
      const columns = threadList.getColumnStates();

      for (const col of columns) {
        const $li = $__("li");
        const $label = $__("label");
        const $input = $__("input");
        $input.type = "checkbox";
        $input.checked = !col.hidden;

        if (!col.canHide) {
          $input.disabled = true;
        }

        $input.on("change", () => {
          const success = threadList.setColumnVisibility(
            col.key,
            $input.checked
          );
          if (!success) {
            $input.checked = !$input.checked; // 最後の1列などは非表示にできない場合があるため戻す
          }
        });

        $label.addLast($input);
        $label.addLast(document.createTextNode(" " + col.label));
        $li.addLast($label);
        $menuList.addLast($li);
      }
    };

    $table.on("threadlist_column_state", updateMenu);

    if ($resetBtn) {
      $resetBtn.on("click", () => {
        threadList.resetColumnPreferences();
      });
    }

    // 初期表示
    updateMenu();
  })();

  const write = function (param) {
    if (param == null) {
      param = {};
    }
    param.title = document.title;
    param.url = urlStr;
    const windowX = app.config.get("write_window_x");
    const windowY = app.config.get("write_window_y");
    const openUrl = `/write/submit_thread.html?${app.URL.buildQuery(param)}`;
    if ("&[BROWSER]" === "firefox" || navigator.userAgent.includes("Vivaldi")) {
      open(
        openUrl,
        undefined,
        `width=600,height=300,left=${windowX},top=${windowY}`
      );
    } else if ("&[BROWSER]" === "chrome") {
      parent.browser.windows.create({
        type: "popup",
        url: openUrl,
        width: 600,
        height: 300,
        left: parseInt(windowX),
        top: parseInt(windowY),
      });
    }
  };

  const $writeButton = $view.C("button_write")[0];
  if (
    ((needle = url.getTsld()),
    [
      "5ch.net",
      "shitaraba.net",
      "bbspink.com",
      "2ch.sc",
      "open2ch.net",
    ].includes(needle))
  ) {
    $writeButton.on("click", function () {
      write();
    });
  } else {
    $writeButton.remove();
  }

  // ソート関連
  (function () {
    const lastBoardSort = app.config.get("last_board_sort_config");
    if (lastBoardSort != null) {
      tableSorter.updateSnake(JSON.parse(lastBoardSort));
    }

    $table.on("table_sort_updated", function ({ detail }) {
      app.config.set("last_board_sort_config", JSON.stringify(detail));
    });
    //.sort_item_selectorが非表示の時、各種項目のソート切り替えを
    //降順ソート→昇順ソート→標準ソートとする
    $table.on("click", function ({ target }) {
      const th = target.closest("th");
      if (!th || !th.hasClass("table_sort_asc")) {
        return;
      }
      if ($view.C("sort_item_selector")[0].offsetWidth !== 0) {
        return;
      }
      $table.on(
        "table_sort_before_update",
        function (e) {
          e.preventDefault();
          tableSorter.update({
            sortAttribute: "data-thread-number",
            sortOrder: "asc",
          });
        },
        { once: true }
      );
    });
  })();

  new app.view.TabContentView($view);

  (async function () {
    const title = await app.BoardTitleSolver.ask(url);
    if (title) {
      document.title = title;
    }
    if (!app.config.isOn("no_history")) {
      app.History.add(urlStr, title || urlStr, openedAt, title || urlStr);
    }
  })();

  const load = async function (ex) {
    $view.addClass("loading");

    try {
      // 既読状態の更新リクエスト（バックグラウンドでの同期を待つためのハック）
      app.message.send("request_update_read_state", { board_url: urlStr });
      await app.wait(150);

      // Service層を使ってスレ一覧（既読・ブックマーク統合済み）を取得
      const { threads, message } = await container.board.getThreads(url);

      const $messageBar = $view.C("message_bar")[0];
      if (message) {
        $messageBar.addClass("error");
        $messageBar.innerHTML = message;
      } else {
        $messageBar.removeClass("error");
        $messageBar.removeChildren();
      }

      threadList.empty();
      threadList.addItem(threads);

      // スレ建て後の処理
      if (ex != null) {
        const writeFlag = !app.config.isOn("no_writehistory");
        if (ex.kind === "own") {
          if (writeFlag) {
            await app.WriteHistory.add({
              url: ex.thread_url,
              res: 1,
              title: ex.title,
              name: ex.name,
              mail: ex.mail,
              message: ex.mes,
              date: Date.now().valueOf(),
            });
          }
          app.message.send("open", { url: ex.thread_url, new_tab: true });
        } else {
          for (let thread of threads) {
            if (thread.title.includes(ex.title)) {
              if (writeFlag) {
                await app.WriteHistory.add({
                  url: thread.url,
                  res: 1,
                  title: ex.title,
                  name: ex.name,
                  mail: ex.mail,
                  message: ex.mes,
                  date: thread.createdAt,
                });
              }
              app.message.send("open", { url: thread.url, new_tab: true });
              break;
            }
          }
        }
      }

      tableSorter.update();
    } catch (error1) {
      console.error(error1);
      const $messageBar = $view.C("message_bar")[0];
      $messageBar.addClass("error");
      $messageBar.innerHTML = error1.message || "板の取得に失敗しました";
    }

    $view.removeClass("loading");

    if ($table.hasClass("table_search")) {
      $view.C("searchbox")[0].emit(new Event("input"));
    }

    $view.emit(new Event("view_loaded"));

    const $button = $view.C("button_reload")[0];
    $button.addClass("disabled");
    await app.wait5s();
    $button.removeClass("disabled");
  };

  $view.on("request_reload", function ({ detail }) {
    if ($view.hasClass("loading")) {
      return;
    }
    if ($view.C("button_reload")[0].hasClass("disabled")) {
      return;
    }
    load(detail);
  });
  load();
});

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
