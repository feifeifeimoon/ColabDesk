/**
 * The update controls: what the updater is doing, and the one action that makes
 * sense next.
 *
 * Every state names its own affordance rather than showing a fixed button whose
 * meaning depends on context — a disabled "检查更新" while a download runs is
 * less informative than saying what is happening.
 */

import { useTranslation } from "react-i18next";
import type { UpdateFailureReason, UpdateStatus } from "@shared/types";
import { Button } from "../../components/ui/Button";
import { Panel, PanelRow } from "../../components/ui/Card";
import { Callout } from "../../components/ui/Notice";
import { openExternal } from "../../lib/api";
import { useAppStore } from "../../store";

const RELEASES_URL = "https://github.com/feifeifeimoon/ColabDesk/releases/latest";

/** Why a failure happened, in words. `unknown` falls back to the raw detail. */
function failureText(reason: UpdateFailureReason, detail: string, t: (key: string, fallback: string) => string) {
  switch (reason) {
    case "network":
      return t(
        "settings.updateFailedNetwork",
        "连不上更新服务器。检查网络或代理后重试；这不影响应用继续使用。",
      );
    case "missing-release":
      return t("settings.updateFailedMissing", "这次发布还没有可用的更新包，稍后再试。");
    case "unavailable":
      return t("settings.updateFailedUnavailable", "当前安装包不带更新信息，请到发布页面手动下载。");
    default:
      return detail;
  }
}

export function UpdatePanel() {
  const { t } = useTranslation();
  const status = useAppStore((state) => state.update);
  const check = useAppStore((state) => state.checkForUpdates);
  const download = useAppStore((state) => state.downloadUpdate);
  const install = useAppStore((state) => state.installUpdate);

  function describe(current: UpdateStatus): string {
    switch (current.state) {
      case "unavailable":
        return t("settings.updateUnavailable", "当前平台暂不支持自动更新，请到发布页面手动下载。");
      case "idle":
        return t("settings.updateIdle", "还没检查过。");
      case "checking":
        return t("settings.updateChecking", "正在检查…");
      case "available":
        return t("settings.updateAvailable", "有新版本 {{version}}。", { version: current.version });
      case "not-available":
        return t("settings.updateLatest", "已是最新版本。");
      case "downloading":
        return t("settings.updateDownloading", "正在下载 {{version}}（{{percent}}%）…", {
          version: current.version,
          percent: current.percent,
        });
      case "downloaded":
        return t("settings.updateDownloaded", "{{version}} 已下载，重启后生效。", { version: current.version });
      case "error":
        return current.userInitiated
          ? failureText(current.reason, current.detail, t)
          : t("settings.updateFailedQuiet", "上次后台检查没有成功，稍后会自动重试。");
    }
  }

  function action() {
    switch (status.state) {
      case "available":
        return (
          <Button variant="primary" size="sm" data-testid="update-download" onClick={() => void download()}>
            {t("settings.updateDownloadAction", "下载更新")}
          </Button>
        );
      case "downloaded":
        return (
          <Button variant="primary" size="sm" data-testid="update-install" onClick={() => void install()}>
            {t("settings.updateInstallAction", "重启以更新")}
          </Button>
        );
      case "downloading":
        return null;
      case "error":
        // Only offered when the failure left a version to ask for again.
        return status.version === null ? null : (
          <Button variant="outline" size="sm" data-testid="update-retry" onClick={() => void download()}>
            {t("settings.updateRetryAction", "重试")}
          </Button>
        );
      default:
        return (
          <Button
            variant="outline"
            size="sm"
            data-testid="update-check"
            disabled={status.state === "checking" || status.state === "unavailable"}
            onClick={() => void check()}
          >
            {t("settings.updateCheckAction", "检查更新")}
          </Button>
        );
    }
  }

  return (
    <Panel>
      <PanelRow
        label={t("settings.updateLabel", "自动更新")}
        description={t("settings.updateDesc", "后台每天检查一次；下载和重启都由你决定。")}
        value={<span data-testid="update-status">{describe(status)}</span>}
        actions={action()}
      />
      {(status.state === "available" || status.state === "unavailable") && (
        <PanelRow
          label={t("settings.updateReleaseLabel", "发布页面")}
          actions={
            <Button variant="ghost" size="sm" onClick={() => openExternal(RELEASES_URL)}>
              {t("settings.updateReleaseAction", "打开发布页面")}
            </Button>
          }
        />
      )}
      {status.state === "error" && status.userInitiated && (
        <div style={{ padding: "var(--space-2) var(--space-3)" }}>
          <Callout tone="warn">
            <p className="hint">{status.detail}</p>
          </Callout>
        </div>
      )}
    </Panel>
  );
}
