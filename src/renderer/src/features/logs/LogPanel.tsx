/**
 * Where the app's log is, and the one button that gets you to it.
 *
 * A failure the user can see should be one somebody can read afterwards, and
 * that only works if the file is findable without a path being handed out
 * separately — this row is the handing out. The path is shown rather than
 * hidden behind the button because a bug report usually has to carry it too.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Panel, PanelRow } from "../../components/ui/Card";
import { logPath, revealLog } from "../../lib/api";

export function LogPanel() {
  const { t } = useTranslation();
  const [path, setPath] = useState("");

  // Read once per visit: the settings sections unmount with the page, and the
  // answer cannot change while this is on screen.
  useEffect(() => {
    let cancelled = false;
    void logPath()
      .then((value) => {
        if (!cancelled) setPath(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel>
      <PanelRow
        label={t("settings.logLabel", "运行日志")}
        description={t(
          "settings.logDescription",
          "应用做了什么、命令行回了什么，都记在这一个文件里。反馈问题时附上它，比描述现象有用。",
        )}
        value={path || "—"}
        title={path}
        actions={
          <Button variant="outline" size="sm" data-testid="reveal-log" onClick={() => void revealLog()}>
            {t("settings.logReveal", "打开日志")}
          </Button>
        }
      />
    </Panel>
  );
}
