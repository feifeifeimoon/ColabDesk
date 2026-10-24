import { createPortal } from "react-dom";
import type { TabDropTarget } from "./tab-drag";

/**
 * The half of a pane a split would occupy. It is drawn over the workbench, not
 * inside it: the portal keeps it above the terminal canvases, and
 * `pointer-events: none` leaves the drag's own geometry in charge.
 */
export function TabDragOverlay({ target }: { target: TabDropTarget | null }) {
  if (!target || target.kind !== "pane") return null;

  return createPortal(
    <div
      className="tab-drop-overlay"
      data-zone={target.zone}
      data-tone={target.tone}
      style={target.bounds}
      aria-hidden="true"
    />,
    document.body,
  );
}
