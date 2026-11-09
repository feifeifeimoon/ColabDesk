/**
 * A local port forward through the real main process and the fake runtime.
 *
 * The mock SSH server answers `direct-tcpip` with the destination it was asked
 * for; the spec reaches that answer through the app's own loopback listener, so
 * the button, the add form, the manager, the SSH channel and the socket are all
 * the production ones.
 */

import net from "node:net";
import { expect, openSession, test } from "./app-launch";

/** Connects to the app's local listener, writes once, and returns the answer. */
function readOnce(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => socket.end("ping\n"));
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => (data += chunk));
    socket.on("close", () => resolve(data));
    socket.on("error", reject);
    socket.setTimeout(5_000, () => {
      socket.destroy();
      reject(new Error("local connection timed out"));
    });
  });
}

test("状态栏 Ports 按钮能新增映射，并在本机读到运行时端口", async ({ page }) => {
  await openSession(page, "e2e-alpha");

  const button = page.locator('[data-testid="ports-button"]');
  await expect(button).toBeVisible();
  await expect(button).toContainText("0");

  await button.click();
  const popover = page.locator('[data-testid="ports-popover"]');
  await expect(popover).toBeVisible();

  await popover.locator('[data-testid="ports-remote"]').fill("8000");
  await popover.locator('[data-testid="ports-add"]').click();

  const row = popover.locator('[data-testid^="port-row-"]').filter({ hasText: "8000" });
  await expect(row).toContainText("已映射");
  await expect(button).toContainText("1");

  const local = await row.locator(".port-row__local").textContent();
  const port = Number(local?.split(":")[1]);
  expect(port).toBeGreaterThan(0);

  // The mock runtime writes back the destination it was asked to reach.
  expect(await readOnce(port)).toContain("remote:127.0.0.1:8000");

  await row.getByRole("button", { name: "停止" }).click();
  await expect(row).toContainText("已停止");
  await expect(button).toContainText("0");

  let refused = false;
  try {
    await readOnce(port);
  } catch {
    refused = true;
  }
  expect(refused).toBe(true);
});
