import React from "react";

export const ThreadFooter: React.FC = () => {
  return (
    <footer className="thread_footer">
      <div className="loading_indicator hidden">読み込み中</div>
      <a className="next_unread open_in_rcrx hidden" />
      <button className="search_next_thread hidden">次スレ検索</button>
    </footer>
  );
};
