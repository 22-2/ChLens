import type { Preview } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { TooltipProvider } from "src/view/browser/ui/Tooltip";
import "src/view/browser/styles/index.css";
import "../apps/chlens-live/src/app/styles.css";

function withSharedProviders(Story: () => ReactNode) {
  return (
    <TooltipProvider>
      <Story />
    </TooltipProvider>
  );
}

const preview: Preview = {
  decorators: [withSharedProviders],
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
  },
};

export default preview;
