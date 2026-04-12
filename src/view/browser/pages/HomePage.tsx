import React from "react";
import { useTabStore } from "../hooks/use-tab-store";

export const HomePage: React.FC = () => {
  const { dispatch } = useTabStore();

  return (
    <div className="home-page">
      <h1 className="home-page__title">read.crx-2</h1>
      <p className="home-page__subtitle">5ch互換掲示板ブラウザ</p>
      <div className="home-page__actions">
        <button
          className="home-page__btn"
          onClick={() =>
            dispatch({
              type: "NAVIGATE",
              page: { type: "boardList", title: "板一覧" },
            })
          }
        >
          板一覧を開く
        </button>
      </div>
    </div>
  );
};
