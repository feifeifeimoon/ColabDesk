import { expect, test } from "./app-launch";

// The stepper is the first thing in the app that writes the page zoom. It must
// change the page (the factor the top bar divides out), not just its own label.
test("外观里可以缩放整个界面，重置回到 100%", async ({ page }) => {
  await page.locator('[data-testid="open-settings"]').click();

  const value = page.locator('[data-testid="ui-zoom-value"]');
  const reset = page.getByRole("button", { name: "重置" });
  const factor = () =>
    page.evaluate(() =>
      Number(document.documentElement.style.getPropertyValue("--ui-zoom-factor")),
    );

  await expect(value).toHaveText("100%");
  await expect(reset).toBeDisabled();

  await page.getByRole("button", { name: "放大界面" }).click();
  await expect(value).toHaveText("110%");
  await expect.poll(factor).toBeCloseTo(1.2 ** 0.5, 3);

  await page.getByRole("button", { name: "放大界面" }).click();
  await expect(value).toHaveText("120%");
  await page.getByRole("button", { name: "缩小界面" }).click();
  await expect(value).toHaveText("110%");
  await expect(reset).toBeEnabled();

  await reset.click();
  await expect(value).toHaveText("100%");
  await expect(reset).toBeDisabled();
  await expect.poll(factor).toBeCloseTo(1, 3);
});

test("界面缩放记住上次的选择", async ({ page }) => {
  const factor = () =>
    page.evaluate(() =>
      Number(document.documentElement.style.getPropertyValue("--ui-zoom-factor")),
    );

  await page.locator('[data-testid="open-settings"]').click();
  await page.getByRole("button", { name: "放大界面" }).click();
  await expect(page.locator('[data-testid="ui-zoom-value"]')).toHaveText("110%");

  // The setting is a preference, not a session detail: a reload starts at the
  // stored scale before the first paint.
  await page.reload();
  await expect.poll(factor).toBeCloseTo(1.2 ** 0.5, 3);
});
