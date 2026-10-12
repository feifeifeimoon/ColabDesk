/**
 * The grab strip on a rail's inner edge.
 *
 * It resizes by writing the panel's width straight to the DOM and committing to
 * the store only on release. A drag crosses a terminal that is streaming, and a
 * store write mid-drag re-renders the shell: were the live width a prop, that
 * render would snap the rail back to the stored value and the strip would lag
 * behind the pointer. React leaves the width alone through such a render,
 * because from its side the prop never changed.
 *
 * Pointer capture rather than a full-window overlay: capture retargets the move
 * and the release to this element, so the terminal's canvas never sees them —
 * left to itself a canvas swallows the release, and the rail follows the cursor
 * with the button already up.
 */

import { useEffect, useRef, useState } from "react";
import { PANEL_WIDTH, nextPanelWidth, type PanelSide } from "../../lib/panel-width";

/** One arrow-key press. Shift moves by a rail's worth instead of a nudge. */
const KEY_STEP = 16;
const KEY_STEP_COARSE = 64;

export function PanelDivider({
  side,
  edge,
  label,
  width,
  onCommit,
  testId,
}: {
  side: PanelSide;
  /** The panel's edge the strip sits on, which is also the drag direction. */
  edge: "left" | "right";
  /** Named for assistive technology, since the separator has no text. */
  label: string;
  width: number;
  onCommit: (width: number) => void;
  testId?: string;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const frame = useRef<number | null>(null);
  const draft = useRef(width);
  const committed = useRef(width);

  useEffect(() => {
    committed.current = width;
  }, [width]);

  const limits = PANEL_WIDTH[side];
  // A right-edge strip grows the panel as the pointer moves right; a left-edge
  // one grows it as the pointer moves left.
  const deltaSign = edge === "right" ? 1 : -1;

  const paint = (next: number): void => {
    const panel = elementRef.current?.parentElement;
    if (panel) panel.style.width = `${next}px`;
  };

  const end = (commit: boolean): void => {
    if (!drag.current) return;
    drag.current = null;
    if (frame.current !== null) {
      window.cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setResizing(false);

    if (commit && draft.current !== committed.current) onCommit(draft.current);
    else paint(committed.current);
  };

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: committed.current };
    draft.current = committed.current;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;

    const next = nextPanelWidth(side, active.startWidth, (event.clientX - active.startX) * deltaSign);
    if (next === draft.current) return;
    draft.current = next;

    // One paint per frame: a pointer can report far more often than the screen
    // refreshes, and every paint resizes the terminal behind it.
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      paint(draft.current);
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_COARSE : KEY_STEP;
    const next = nextPanelWidth(side, committed.current, direction * step * deltaSign);
    if (next !== committed.current) onCommit(next);
  }

  return (
    <div
      ref={elementRef}
      className="panel-divider"
      data-edge={edge}
      data-testid={testId ?? `divider-${side}`}
      data-resizing={resizing ? "true" : undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) end(true);
      }}
      // Losing the capture means the drag is over whether or not we saw the
      // release — a window switch, or the strip itself going away.
      onLostPointerCapture={() => end(false)}
      onKeyDown={onKeyDown}
    />
  );
}
