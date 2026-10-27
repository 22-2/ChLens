import { verifyTwoPaneFilters } from "../extension-points-scenarios.mjs";
import { test } from "./fixtures.mjs";

test("2ペインでフィルター操作がそれぞれのスレに届く", async ({ page, localBoard }) => {
  await verifyTwoPaneFilters(page, localBoard);
});
