/**
 * The CLI reports trouble in two shapes worth translating: a Python traceback
 * with a network cause, or an unhandled exception. Everything else is left to
 * the raw output.
 */

import { translate } from "../i18n/i18n";

export function failureHint(output: string): string | null {
  if (
    /SSLError|UNEXPECTED_EOF_WHILE_READING|ConnectionResetError|ConnectionError|Max retries exceeded|Temporary failure in name resolution|Read timed out|RemoteDisconnected/i.test(
      output,
    )
  ) {
    return translate(
      "failure.networkInterrupted",
      "网络请求被中断：与 colab.research.google.com 的 TLS 连接被重置。偶发时重试即可；若持续失败，请检查代理/VPN 是否正常路由 Google 域名。",
    );
  }
  if (/Traceback \(most recent call last\)/i.test(output)) {
    return translate("failure.traceback", "colab 命令抛出异常，完整堆栈见下方输出。");
  }
  return null;
}

/** "命令执行失败（退出码 1）" — the code is omitted when the CLI was killed. */
export function failureLabel(code: number | null): string {
  return code === null
    ? translate("failure.failed", "命令执行失败。")
    : translate("failure.failedWithCode", `命令执行失败（退出码 ${code}）。`, { code });
}
