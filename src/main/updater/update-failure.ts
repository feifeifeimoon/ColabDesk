/**
 * electron-updater reports failures as transport-level strings —
 * `net::ERR_INTERNET_DISCONNECTED`, `HttpError: 404 Not Found`,
 * `Cannot find app-update.yml`. None of those is something to show a person,
 * and the main process has no notion of the interface language anyway, so the
 * category is what crosses the IPC boundary and the renderer writes the
 * sentence.
 */

import type { UpdateFailureReason } from "@shared/types";

const NETWORK = /net::ERR_|ETIMEDOUT|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|socket hang up/i;
const MISSING_RELEASE = /HttpError:\s*404|Cannot find .*latest.*\.yml|404 Not Found/i;
const UNAVAILABLE = /app-update\.yml|is not supported|AppImage|ZIP file not provided/i;

export function classifyUpdateFailure(detail: string): UpdateFailureReason {
  if (NETWORK.test(detail)) return "network";
  if (MISSING_RELEASE.test(detail)) return "missing-release";
  if (UNAVAILABLE.test(detail)) return "unavailable";
  return "unknown";
}
