/**
 * The Appearance section's interface zoom.
 *
 * A stepper, not a free slider: each step lands on a scale the rest of the
 * interface has a layout for, and the percentage is the fact the person is
 * choosing. The level is Chromium's page-zoom level (0 is 100%), so the
 * zoom chords, the stepper and Electron all speak the same number.
 */

import { useTranslation } from "react-i18next";
import {
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  UI_ZOOM_STEP,
  stepUiZoomLevel,
  uiZoomPercent,
} from "@shared/zoom";
import { Button, IconButton } from "../components/ui/Button";
import { MinusIcon, PlusIcon, RestartIcon } from "../components/ui/icons";
import { PanelRow } from "../components/ui/Card";
import { useAppStore } from "../store";

export function ZoomSetting() {
  const { t } = useTranslation();
  const level = useAppStore((state) => state.zoomLevel);
  const setZoomLevel = useAppStore((state) => state.setZoomLevel);

  return (
    <PanelRow
      label={t("settings.appearanceZoomLabel", "界面缩放")}
      description={t(
        "settings.appearanceZoomDesc",
        "调整整个窗口的显示比例。",
      )}
      actions={
        <>
          <IconButton
            variant="outline"
            size="sm"
            label={t("settings.appearanceZoomOut", "缩小界面")}
            disabled={level <= UI_ZOOM_MIN}
            onClick={() => setZoomLevel(stepUiZoomLevel(level, -UI_ZOOM_STEP))}
          >
            <MinusIcon size={14} />
          </IconButton>
          <span
            className="mono ui-zoom__value"
            data-testid="ui-zoom-value"
            aria-live="polite"
          >
            {uiZoomPercent(level)}%
          </span>
          <IconButton
            variant="outline"
            size="sm"
            label={t("settings.appearanceZoomIn", "放大界面")}
            disabled={level >= UI_ZOOM_MAX}
            onClick={() => setZoomLevel(stepUiZoomLevel(level, UI_ZOOM_STEP))}
          >
            <PlusIcon size={14} />
          </IconButton>
          <Button
            variant="outline"
            size="sm"
            disabled={level === 0}
            onClick={() => setZoomLevel(0)}
          >
            <RestartIcon size={14} />
            {t("settings.appearanceZoomReset", "重置")}
          </Button>
        </>
      }
    />
  );
}
