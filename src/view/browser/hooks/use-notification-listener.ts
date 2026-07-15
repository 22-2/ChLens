import { useEffect } from "react";
import { toast } from "sonner";
import { container } from "src/service-container/Container";

export function useNotificationListener() {
  useEffect(() => {
    const handleNotify = (data_: unknown) => {
      const data = data_ as Record<string, unknown>;
      const message = (data.message || data.html) as string | undefined;
      if (!message) return;

      const options: Record<string, unknown> = {};
      if (data.background_color) {
        // sonner doesn't directly support background_color in the same way,
        // but we can map some common ones or use style.
        if (data.background_color === "red") {
          toast.error(message);
          return;
        }
        if (data.background_color === "green") {
          toast.success(message);
          return;
        }
        options.style = { backgroundColor: data.background_color };
      }

      toast(message, options);
    };

    container.message.on("notify", handleNotify);
    return () => {
      container.message.off("notify", handleNotify);
    };
  }, []);
}
