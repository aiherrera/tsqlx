import { expect, test } from "@playwright/test";

test("playground shows title and generated TypeScript panel", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "TSQL-X Playground" }),
  ).toBeVisible();
  await expect(page.getByText("Generated TypeScript").first()).toBeVisible();
});
