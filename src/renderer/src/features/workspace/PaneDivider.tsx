import { useRef, useState } from "react";
import {
  MAX_RATIO,
  MIN_GROUP_PX,
  MIN_RATIO,
  type SplitRect,
} from "../../lib/tab-groups";

/** One arrow key press, in surface pixels; Shift moves four times as far. */
const KEY_STEP = 16;
const KEY_STEP_COARSE = 64;

function clampForPixels(raw: number, size: number): number {
  if (!(size > 0)) return 0.5;
  // 240px on each side when the surface can afford it; on a very narrow pane
  // the ratio still wins, exactly like a dragged rail width.
  const margin = Math.min(0.45, Math.max(MIN_RATIO, MIN_GROUP_PX / size));
  return Math.min(1 - margin, Math.max(margin, raw));
}

/**
 * The seam between two panes. It resizes by writing the slots' styles straight
 * to the DOM and commits to the store only on release: a drag crosses terminals
 * that are streaming, and a store write per pointer move would re-run every
 * selector in the window. React leaves the inline styles alone through such a
 * render because the style props did not change.
 */
export function PaneDivider({
  split,
  label,
  onPreview,
  onCommit,
}: {
  split: SplitRect;
  label: string;
  /** Paint a draft ratio without touching the store. */
  onPreview: (ratio: number) => void;
  /** Commit the released ratio; the store re-renders with the same geometry. */
  onCommit: (ratio: number) => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{
    pointerId: number;
    offset: number;
    size: number;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const draft = useRef(split.ratio);

  const paint = (): void => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      onPreview(draft.current);
    });
  };

  const end = (commit: boolean): void => {
    if (!drag.current) return;
    const final = draft.current;
    drag.current = null;
    if (frame.current !== null) {
      window.cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setResizing(false);

    if (commit && final !== split.ratio) onCommit(final);
    else onPreview(split.ratio);
  };

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || drag.current) return;
    const surface = elementRef.current?.parentElement;
    if (!surface) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = surface.getBoundingClientRect();
    const isRow = split.direction === "row";
    drag.current = {
      pointerId: event.pointerId,
      offset: isRow ? rect.left + split.rect.left * rect.width : rect.top + split.rect.top * rect.height,
      size: isRow ? split.rect.width * rect.width : split.rect.height * rect.height,
    };
    draft.current = split.ratio;
    setResizing(true);
    document.body.style.cursor = isRow ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const raw =
      split.direction === "row"
        ? (event.clientX - active.offset) / active.size
        : (event.clientY - active.offset) / active.size;
    const next = clampForPixels(raw, active.size);
    if (next === draft.current) return;
    draft.current = next;
    paint();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const isRow = split.direction === "row";
    const direction = isRow
      ? event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowLeft"
          ? -1
          : 0
      : event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowUp"
          ? -1
          : 0;
    if (direction === 0) return;

    const surface = elementRef.current?.parentElement;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const size = isRow ? split.rect.width * rect.width : split.rect.height * rect.height;
    if (!(size > 0)) return;

    event.preventDefault();
    const step = (event.shiftKey ? KEY_STEP_COARSE : KEY_STEP) / size;
    const next = clampForPixels(split.ratio + direction * step, size);
    if (next !== split.ratio) onCommit(next);
  }

  const style =
    split.direction === "row"
      ? {
          left: `${(split.rect.left + split.rect.width * split.ratio) * 100}%`,
          top: `${split.rect.top * 100}%`,
          height: `${split.rect.height * 100}%`,
        }
      : {
          left: `${split.rect.left * 100}%`,
          top: `${(split.rect.top + split.rect.height * split.ratio) * 100}%`,
          width: `${split.rect.width * 100}%`,
        };

  return (
    <div
      ref={elementRef}
      className="pane-divider"
      data-split-id={split.id}
      data-direction={split.direction}
      data-resizing={resizing ? "true" : undefined}
      style={style}
      role="separator"
      aria-orientation={split.direction === "row" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={Math.round(split.ratio * 100)}
      aria-valuemin={Math.round(MIN_RATIO * 100)}
      aria-valuemax={Math.round(MAX_RATIO * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        if (drag.current?.pointerId === event.pointerId) end(true);
      }}
      onLostPointerCapture={() => end(false)}
      onKeyDown={onKeyDown}
    />
  );
}
