import { useEffect, useState } from "react";
import { readConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import {
  compileImageBlurPattern,
  resolveImageBlurRadius,
} from "src/view/browser/utils/thread-emphasis";

export interface ImageBlurConfigState {
  enabled: boolean;
  radius: number;
  harmfulWordPattern: RegExp | null;
}

const IMAGE_BLUR_CONFIG_KEYS = ["image_blur", "image_blur_length", "image_blur_word"] as const;

function readImageBlurConfig(): ImageBlurConfigState {
  const enabled = readConfigValue("image_blur") === "on";
  const radius = resolveImageBlurRadius(readConfigValue("image_blur_length"));
  const rawPattern = readConfigValue("image_blur_word");
  const harmfulWordPattern =
    typeof rawPattern === "string" ? compileImageBlurPattern(rawPattern) : null;
  return { enabled, radius, harmfulWordPattern };
}

export function useImageBlurConfig(): ImageBlurConfigState {
  const [imageBlurConfig, setImageBlurConfig] = useState<ImageBlurConfigState>(readImageBlurConfig);

  useEffect(() => {
    const applyImageBlurConfig = () => setImageBlurConfig(readImageBlurConfig());
    return subscribeConfigKeys(IMAGE_BLUR_CONFIG_KEYS, applyImageBlurConfig, {
      label: "ImageBlurConfig",
      syncOnUnknownKey: true,
    });
  }, []);

  return imageBlurConfig;
}
