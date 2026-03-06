import React, { useState } from "react";
import {
  Search,
  RotateCw,
  Edit,
  Filter,
  Menu,
  Pause,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

export const ThreadNavBar: React.FC = () => {
  const [searchValue, setSearchValue] = useState("");
  const [isRegexp, setIsRegexp] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showToolMenu, setShowToolMenu] = useState(false);

  return (
    <nav className="nav_bar">
      <button
        className={`button button_regexp ${isRegexp ? "active" : ""}`}
        title="正規表現で検索"
        onClick={() => setIsRegexp(!isRegexp)}
      >
        <Search size={16} />
      </button>

      <label>
        <input
          className="searchbox"
          type="search"
          placeholder="検索"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        <span className="hit_count" />
      </label>

      <button className="button button_back disabled" title="戻る">
        <ChevronLeft size={16} />
      </button>

      <button className="button button_forward disabled" title="進む">
        <ChevronRight size={16} />
      </button>

      <button className="button button_reload" title="再読み込み">
        <RotateCw size={16} />
      </button>

      <button className="button button_write" title="書き込む">
        <Edit size={16} />
      </button>

      <div className="button button_filter" title="レスを絞り込み">
        <Filter size={16} onClick={() => setShowFilterMenu(!showFilterMenu)} />
        <ul className={showFilterMenu ? "" : "hidden"}>
          <li className="filter_all">すべて表示</li>
          <li className="filter_popular">人気レス (3件以上の返信)</li>
          <li className="filter_image">画像</li>
          <li className="filter_video">動画</li>
          <li className="filter_media">画像・動画</li>
          <li className="filter_link">外部リンク</li>
        </ul>
      </div>

      <button className="button button_pause" title="自動更新一時停止">
        <Pause size={16} />
      </button>

      <div className="thread_info" />

      <ul className="breadcrumb">
        <li>
          <a className="open_in_rcrx" />
        </li>
      </ul>

      <div className="button button_tool" title="メニュー">
        <Menu size={16} onClick={() => setShowToolMenu(!showToolMenu)} />
        <ul className={showToolMenu ? "" : "hidden"}>
          <li className="button_link">
            <a target="_blank">ブラウザで直接開く</a>
          </li>
          <li className="button_popout">🪟 このスレッドを別窓で開く</li>
          <li className="button_copy_title_and_url">📋 スレッドのタイトルとURLをコピー</li>
          <li className="button_copy_url">📋 スレッドのURLをコピー</li>
          <li className="button_copy_dat_url">📋 スレッドのdatのURLをコピー</li>
          <li className="button_copy_all">📋 スレッド全文をテキストとしてコピー</li>
          <li className="button_copy_ng_only">📋 （NGされたレスのみ）スレッド全文をテキストとしてコピー</li>
          <li className="button_bookmark_add">🔖 スレッドをブックマーク</li>
          <li className="button_bookmark_remove hidden">🔖 ブックマークを解除</li>
          <li className="button_change_netsc">2ch.net/2ch.scに切り替え</li>
          <li className="button_only_sc">scの投稿だけを表示する/両方表示する</li>
          <li className="button_tool_search_next_thread">🔍 次スレ検索</li>
        </ul>
      </div>
    </nav>
  );
};
