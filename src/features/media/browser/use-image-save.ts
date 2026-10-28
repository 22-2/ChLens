import { useCallback, useState } from "react";
import { createLogger } from "src/app/logger";
import { useToast } from "src/view/browser/hooks/use-toast";

import { saveMediaImage } from "./image-save";

const logger = createLogger("media");

/** 単体とレス単位の保存で同じ元画像の解決と失敗通知を使う。 */
export function useImageSave() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const save = useCallback(
    async (urls: readonly string[]) => {
      if (saving) return;
      const images = [...new Set(urls)];
      if (!images.length) return;
      setSaving(true);
      let failed = 0;
      try {
        for (const url of images) {
          try {
            await saveMediaImage(url);
          } catch (error) {
            failed++;
            logger.error("画像の保存に失敗しました", { url, error });
          }
        }
        if (failed)
          toast.error(`画像 ${images.length} 件のうち ${failed} 件を保存できませんでした`);
        else toast.success(`画像を ${images.length} 件保存しました`);
      } finally {
        setSaving(false);
      }
    },
    [saving, toast],
  );
  return { save, saving };
}
