import { useEffect } from "react";
import { container } from "src/service-container/Container";
import { useToast } from "src/view/browser/hooks/use-toast";

export function useNotificationListener() {
  const toast = useToast();

  useEffect(() => {
    const handleNotify = (data_: unknown) => {
      const data = data_ as Record<string, unknown>;
      const message = (data.message || data.html) as string | undefined;
      if (!message) return;

      const backgroundColor =
        typeof data.background_color === "string" ? data.background_color : undefined;
      if (backgroundColor) {
        if (backgroundColor === "red") {
          toast.error(message);
          return;
        }
        if (backgroundColor === "green") {
          toast.success(message);
          return;
        }
      }

      toast.notify(message, backgroundColor ? { backgroundColor } : undefined);
    };

    container.message.on("notify", handleNotify);
    return () => {
      container.message.off("notify", handleNotify);
    };
  }, [toast]);
}
