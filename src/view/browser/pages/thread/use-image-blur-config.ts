import { useEffect, useState } from "react";
import { container } from "src/service-container/index";
import {
  compileImageBlurPattern,
  resolveImageBlurRadius,
} from "src/view/browser/utils/thread-emphasis";

export interface ImageBlurConfigState {
  enabled: boolean;
  radius: number;
  harmfulWordPattern: RegExp | null;
}

const IMAGE_BLUR_CONFIG_KEYS = new Set([
  "image_blur",
  "image_blur_length",
  "image_blur_word",
]);

function readImageBlurConfig(): ImageBlurConfigState {
  const enabled = container.config.get("image_blur") === "on";
  const radius = resolveImageBlurRadius(
    container.config.get("image_blur_length"),
  );
  const rawPattern = container.config.get("image_blur_word");
  const harmfulWordPattern =
    typeof rawPattern === "string" ? compileImageBlurPattern(rawPattern) : null;
  return { enabled, radius, harmfulWordPattern };
}

export function useImageBlurConfig(): ImageBlurConfigState {
  const [imageBlurConfig, setImageBlurConfig] =
    useState<ImageBlurConfigState>(readImageBlurConfig);

  useEffect(() => {
    const applyImageBlurConfig = () =>
      setImageBlurConfig(readImageBlurConfig());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (!key || IMAGE_BLUR_CONFIG_KEYS.has(key)) {
        applyImageBlurConfig();
      }
    };
    container.config.ready(applyImageBlurConfig);
    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  return imageBlurConfig;
}
