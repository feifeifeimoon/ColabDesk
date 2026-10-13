/**
 * What the app is telling you, under the title bar: a failure from the
 * environment, the result of the row action you just ran, or a build waiting to
 * be installed. All are dismissable and none is a page.
 *
 * The update prompt lives here rather than in a card of its own: this slot is
 * already the app's one place to speak up, so the notice inherits the same
 * width, tone, actions and dismissal rules as everything else that speaks here.
 */

import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Callout } from "../components/ui/Notice";
import { useAppStore } from "../store";

export function Banners() {
  const { t } = useTranslation();
  const error = useAppStore((state) => state.error);
  const notice = useAppStore((state) => state.notice);
  const setNotice = useAppStore((state) => state.setNotice);

  // Primitives only: a download reports progress many times a second, and this
  // component sits near the root of the tree.
  const updateState = useAppStore((state) => state.update.state);
  const updateVersion = useAppStore((state) =>
    state.update.state === "available" || state.update.state === "downloaded" ? state.update.version : null,
  );
  const dismissedVersion = useAppStore((state) => state.dismissedVersion);
  const downloadUpdate = useAppStore((state) => state.downloadUpdate);
  const installUpdate = useAppStore((state) => state.installUpdate);
  const dismissUpdate = useAppStore((state) => state.dismissUpdate);

  // A build the user waved away stays away; the next one starts fresh.
  const offered = updateState === "available" && updateVersion !== null && updateVersion !== dismissedVersion;
  const ready = updateState === "downloaded";

  if (!error && !notice && !offered && !ready) return null;

  return (
    <>
      {error && (
        <p className="error banner" style={{ margin: "var(--space-2) var(--space-3) 0" }}>
          {error}
        </p>
      )}
      {notice && (
        <div style={{ margin: "var(--space-2) var(--space-3) 0" }}>
          <Callout tone={notice.tone}>
            <span className="row" style={{ justifyContent: "space-between" }}>
              <span>{notice.text}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNotice(null)}>
                {t("banners.dismiss", "知道了")}
              </button>
            </span>
          </Callout>
        </div>
      )}
      {(offered || ready) && (
        <div style={{ margin: "var(--space-2) var(--space-3) 0" }} data-testid="update-banner">
          <Callout tone="info">
            <span className="row" style={{ justifyContent: "space-between", gap: "var(--space-2)" }}>
              <span>
                {ready
                  ? t("banners.updateReady", "{{version}} 已下载，重启后生效。", { version: updateVersion })
                  : t("banners.updateOffered", "有新版本 {{version}}。", { version: updateVersion })}
              </span>
              <span className="row" style={{ gap: "var(--space-1)" }}>
                {ready ? (
                  <Button
                    variant="primary"
                    size="sm"
                    data-testid="update-banner-install"
                    onClick={() => void installUpdate()}
                  >
                    {t("banners.updateRestart", "重启以更新")}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      data-testid="update-banner-download"
                      onClick={() => void downloadUpdate()}
                    >
                      {t("banners.updateDownload", "下载更新")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="update-banner-dismiss"
                      onClick={() => updateVersion !== null && dismissUpdate(updateVersion)}
                    >
                      {t("banners.dismiss", "知道了")}
                    </Button>
                  </>
                )}
              </span>
            </span>
          </Callout>
        </div>
      )}
    </>
  );
}
