import React from "react";
import { PAGE_TYPE_DEFINITIONS } from "src/view/browser/page-type-definitions";
import type { PageType } from "src/view/browser/types";

export const PageTypeIcon: React.FC<{ type: PageType; size?: number }> = ({ type, size = 15 }) => {
  const Icon = PAGE_TYPE_DEFINITIONS[type].icon;
  return <Icon size={size} aria-hidden="true" />;
};
