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
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export const ThreadNavBar: React.FC = () => {
  const [searchValue, setSearchValue] = useState("");
  const [isRegexp, setIsRegexp] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showToolMenu, setShowToolMenu] = useState(false);

  return (
    <nav className="nav_bar flex items-center gap-1 p-1 border-b bg-background">
      <Button
        variant={isRegexp ? "default" : "ghost"}
        size="icon"
        title="正規表現で検索"
        onClick={() => setIsRegexp(!isRegexp)}
        className="h-8 w-8"
      >
        <Search size={16} />
      </Button>

      <div className="flex-1 flex items-center gap-2 px-2">
        <Input
          type="search"
          placeholder="検索"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="h-8 text-sm"
        />
        <span className="hit_count text-xs text-muted-foreground" />
      </div>

      <Button
        variant="ghost"
        size="icon"
        title="戻る"
        disabled
        className="h-8 w-8"
      >
        <ChevronLeft size={16} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="進む"
        disabled
        className="h-8 w-8"
      >
        <ChevronRight size={16} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="再読み込み"
        className="h-8 w-8"
      >
        <RotateCw size={16} />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        title="書き込む"
        className="h-8 w-8"
      >
        <Edit size={16} />
      </Button>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          title="レスを絞り込み"
          onClick={() => setShowFilterMenu(!showFilterMenu)}
          className="h-8 w-8"
        >
          <Filter size={16} />
        </Button>
        {showFilterMenu && (
          <ul className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md py-1 min-w-[200px] z-50">
            <li className="filter_all px-3 py-2 hover:bg-accent cursor-pointer text-sm">すべて表示</li>
            <li className="filter_popular px-3 py-2 hover:bg-accent cursor-pointer text-sm">人気レス (3件以上の返信)</li>
            <li className="filter_image px-3 py-2 hover:bg-accent cursor-pointer text-sm">画像</li>
            <li className="filter_video px-3 py-2 hover:bg-accent cursor-pointer text-sm">動画</li>
            <li className="filter_media px-3 py-2 hover:bg-accent cursor-pointer text-sm">画像・動画</li>
            <li className="filter_link px-3 py-2 hover:bg-accent cursor-pointer text-sm">外部リンク</li>
          </ul>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        title="自動更新一時停止"
        className="h-8 w-8"
      >
        <Pause size={16} />
      </Button>

      <div className="thread_info text-xs px-2" />

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          title="メニュー"
          onClick={() => setShowToolMenu(!showToolMenu)}
          className="h-8 w-8"
        >
          <Menu size={16} />
        </Button>
        {showToolMenu && (
          <ul className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md py-1 min-w-[250px] z-50">
            <li className="button_link px-3 py-2 hover:bg-accent cursor-pointer text-sm">
              <a target="_blank">ブラウザで直接開く</a>
            </li>
            <li className="button_popout px-3 py-2 hover:bg-accent cursor-pointer text-sm">🪟 このスレッドを別窓で開く</li>
            <li className="button_copy_title_and_url px-3 py-2 hover:bg-accent cursor-pointer text-sm">📋 スレッドのタイトルとURLをコピー</li>
            <li className="button_copy_url px-3 py-2 hover:bg-accent cursor-pointer text-sm">📋 スレッドのURLをコピー</li>
            <li className="button_copy_dat_url px-3 py-2 hover:bg-accent cursor-pointer text-sm">📋 スレッドのdatのURLをコピー</li>
            <li className="button_copy_all px-3 py-2 hover:bg-accent cursor-pointer text-sm">📋 スレッド全文をテキストとしてコピー</li>
            <li className="button_bookmark_add px-3 py-2 hover:bg-accent cursor-pointer text-sm">🔖 スレッドをブックマーク</li>
            <li className="button_tool_search_next_thread px-3 py-2 hover:bg-accent cursor-pointer text-sm">🔍 次スレ検索</li>
          </ul>
        )}
      </div>
    </nav>
  );
};
