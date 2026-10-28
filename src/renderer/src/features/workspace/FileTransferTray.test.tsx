import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";
import { FileTransferTray } from "./FileTransferTray";
import type { TransferProgress } from "@shared/types";

describe("FileTransferTray", () => {
  it("renders nothing when transfers list is empty", () => {
    const html = renderToStaticMarkup(
      createElement(FileTransferTray, {
        transfers: [],
        onDismiss: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    expect(html).toBe("");
  });

  it("renders ongoing upload progress with cancel button and progress bar", () => {
    const transfer: TransferProgress = {
      id: "transfer-1",
      session: "session-a",
      direction: "upload",
      name: "model.pt",
      transferred: 50,
      total: 100,
      done: false,
      error: null,
    };

    const html = renderToStaticMarkup(
      createElement(FileTransferTray, {
        transfers: [transfer],
        onDismiss: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(html).toContain("↑ model.pt");
    expect(html).toContain("50%");
    expect(html).toContain('data-testid="cancel-transfer-1"');
    expect(html).toContain('role="progressbar"');
  });

  it("renders completed download with dismiss button and without progress bar", () => {
    const transfer: TransferProgress = {
      id: "transfer-2",
      session: "session-a",
      direction: "download",
      name: "output.log",
      transferred: 100,
      total: 100,
      done: true,
      error: null,
    };

    const html = renderToStaticMarkup(
      createElement(FileTransferTray, {
        transfers: [transfer],
        onDismiss: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(html).toContain("↓ output.log");
    expect(html).toContain("完成");
    expect(html).toContain("transfer__state--ok");
    expect(html).not.toContain("progress-bar");
    expect(html).not.toContain('data-testid="cancel-transfer-2"');
  });

  it("renders error state when transfer fails", () => {
    const transfer: TransferProgress = {
      id: "transfer-3",
      session: "session-a",
      direction: "upload",
      name: "error.txt",
      transferred: 10,
      total: 100,
      done: true,
      error: "Connection lost",
    };

    const html = renderToStaticMarkup(
      createElement(FileTransferTray, {
        transfers: [transfer],
        onDismiss: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(html).toContain("Connection lost");
    expect(html).toContain("transfer__state--error");
  });
});
