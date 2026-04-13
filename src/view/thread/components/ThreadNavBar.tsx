import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  ExternalLink,
  Filter,
  Menu,
  Monitor,
  Pause,
  RotateCw,
  Search,
} from "lucide-react";
import React, { useState } from "react";
import { Button } from "src/view/thread/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "src/view/thread/components/ui/dropdown-menu";
import { Input } from "src/view/thread/components/ui/input";

export const ThreadNavBar: React.FC = () => {
  const [searchValue, setSearchValue] = useState("");
  const [isRegexp, setIsRegexp] = useState(false);

  return (
    <nav className="nav_bar flex items-center gap-1 py-1 px-1 border-b bg-background">
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

      <Button variant="ghost" size="icon" title="書き込む" className="h-8 w-8">
        <Edit size={16} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="レスを絞り込み"
            className="h-8 w-8"
          >
            <Filter size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem className="filter_all">すべて表示</DropdownMenuItem>
          <DropdownMenuItem className="filter_popular">
            人気レス (3件以上の返信)
          </DropdownMenuItem>
          <DropdownMenuItem className="filter_image">画像</DropdownMenuItem>
          <DropdownMenuItem className="filter_video">動画</DropdownMenuItem>
          <DropdownMenuItem className="filter_media">
            画像・動画
          </DropdownMenuItem>
          <DropdownMenuItem className="filter_link">
            外部リンク
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        title="自動更新一時停止"
        className="h-8 w-8"
      >
        <Pause size={16} />
      </Button>

      <div className="thread_info text-xs px-2" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="メニュー"
            className="h-8 w-8"
          >
            <Menu size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[250px]">
          <DropdownMenuItem className="button_link">
            <a target="_blank" className="flex items-center gap-2 w-full">
              <ExternalLink size={14} /> ブラウザで直接開く
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem className="button_popout flex items-center gap-2">
            <Monitor size={14} /> このスレッドを別窓で開く
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="button_copy_title_and_url flex items-center gap-2">
            <Copy size={14} /> スレッドのタイトルとURLをコピー
          </DropdownMenuItem>
          <DropdownMenuItem className="button_copy_url flex items-center gap-2">
            <Copy size={14} /> スレッドのURLをコピー
          </DropdownMenuItem>
          <DropdownMenuItem className="button_copy_dat_url flex items-center gap-2">
            <Copy size={14} /> スレッドのdatのURLをコピー
          </DropdownMenuItem>
          <DropdownMenuItem className="button_copy_all flex items-center gap-2">
            <Copy size={14} /> スレッド全文をテキストとしてコピー
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="button_bookmark_add flex items-center gap-2">
            <Bookmark size={14} /> スレッドをブックマーク
          </DropdownMenuItem>
          <DropdownMenuItem className="button_tool_search_next_thread flex items-center gap-2">
            <Search size={14} /> 次スレ検索
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
};
