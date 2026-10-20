/**
 * A failed command, said in a way the person reading it can act on.
 *
 * The CLI reports trouble in its own words, and those are the words worth
 * showing: an app that answers a failed action with "read the log" has answered
 * nothing — nobody opens a log file to find out why a button did not work. So
 * the shapes worth translating are translated here, and everything else falls
 * back to the line the CLI itself ended on.
 *
 * The full text still goes to the log, where whoever maintains this can read it.
 * Nobody is told to.
 */

import { translate } from "../i18n/i18n";

const NETWORK =
  /SSLError|UNEXPECTED_EOF_WHILE_READING|ConnectionResetError|ConnectionError|Max retries exceeded|Temporary failure in name resolution|Read timed out|RemoteDisconnected/i;
const TRACEBACK = /Traceback \(most recent call last\)/i;
const ACCELERATOR_REFUSED = /Backend rejected accelerator|not have quota or entitlement/i;

/** A recognised failure's sentence. `null` when the shape is not one we know. */
export function failureHint(output: string): string | null {
  if (NETWORK.test(output)) {
    return translate(
      "failure.networkInterrupted",
      "网络请求被中断：与 colab.research.google.com 的 TLS 连接被重置。偶发时重试即可；若持续失败，请检查代理/VPN 是否正常路由 Google 域名。",
    );
  }
  if (ACCELERATOR_REFUSED.test(output)) {
    return translate("failure.acceleratorRefused", "这个账号当前拿不到所选机型，换一个再试。");
  }
  if (TRACEBACK.test(output)) {
    return translate("failure.traceback", "colab 命令抛出了异常。可以重试；反复出现时用「复制详情」交给维护者。");
  }
  return null;
}

/** Where a line stops being an answer and starts being noise. */
const MAX_REASON_CHARS = 200;

/**
 * The CLI's own last word, for the failures no sentence above covers: the last
 * non-empty line of its output, which for a rejected command is the reason.
 *
 * A traceback is skipped — its last line is a stack frame, and that case has a
 * sentence of its own.
 */
export function failureReason(output: string): string | null {
  if (TRACEBACK.test(output)) return null;
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const last = lines[lines.length - 1];
  if (!last) return null;
  return last.length > MAX_REASON_CHARS ? `${last.slice(0, MAX_REASON_CHARS)}…` : last;
}

/** "命令执行失败（退出码 1）" — the code is omitted when the CLI was killed. */
export function failureLabel(code: number | null): string {
  return code === null
    ? translate("failure.failed", "命令执行失败。")
    : translate("failure.failedWithCode", `命令执行失败（退出码 ${code}）。`, { code });
}
