import React, { useState } from "react";
import { createLogger } from "src/app/logger";
import { Spinner } from "src/view/browser/ui/Spinner";

import { ExternalImage } from "./ExternalImage";

const logger = createLogger("media");

type ManualLoadExternalImageProps = React.ComponentProps<typeof ExternalImage> & {
  containerClassName?: string;
  errorLabel?: string;
};

/** 手動取得を選んだ画像は、読み込み完了まで同じ枠内に状態を表示する。 */
export function ManualLoadExternalImage({
  containerClassName,
  errorLabel = "画像の取得に失敗しました",
  onLoad,
  onError,
  ...imageProps
}: ManualLoadExternalImageProps): React.ReactElement {
  const [loadState, setLoadState] = useState<{
    src: string;
    state: "loading" | "loaded" | "error";
  }>(() => ({ src: imageProps.src, state: "loading" }));
  const currentLoadState = loadState.src === imageProps.src ? loadState.state : "loading";

  return (
    <span className={`res__manual-image-load${containerClassName ? ` ${containerClassName}` : ""}`}>
      <ExternalImage
        {...imageProps}
        manualLoad={false}
        onLoad={(event) => {
          setLoadState({ src: imageProps.src, state: "loaded" });
          onLoad?.(event);
        }}
        onError={(event) => {
          logger.error("手動取得した画像を表示できませんでした", { url: imageProps.src });
          setLoadState({ src: imageProps.src, state: "error" });
          onError?.(event);
        }}
      />
      {currentLoadState === "loading" ? (
        <span className="res__manual-image-load__status" role="status" aria-label="画像を取得中">
          <Spinner size="sm" aria-hidden="true" />
          <span>取得中</span>
        </span>
      ) : currentLoadState === "error" ? (
        <span className="res__manual-image-load__status" role="status">
          {errorLabel}
        </span>
      ) : null}
    </span>
  );
}
