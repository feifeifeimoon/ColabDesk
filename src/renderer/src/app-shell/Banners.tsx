/**
 * What the app is telling you, under the title bar: a failure from the
 * environment, or the result of the row action you just ran. Both are
 * dismissable and neither is a page.
 */

import { useTranslation } from "react-i18next";
import { Callout } from "../components/ui/Notice";
import { useAppStore } from "../store";

export function Banners() {
  const { t } = useTranslation();
  const error = useAppStore((state) => state.error);
  const notice = useAppStore((state) => state.notice);
  const setNotice = useAppStore((state) => state.setNotice);

  if (!error && !notice) return null;

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
    </>
  );
}
