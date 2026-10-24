import { useCallback, useEffect, useRef } from "react";
import { TAB_DRAG_ACTIVATION_DISTANCE } from "./tab-drag";

/**
 * Tab activation waits for pointer-up, and a press that turns into a drag never
 * activates at all. Switching eagerly on pointer-down would make a drag start
 * from the wrong pane: a hidden tab would be brought forward before it could be
 * dragged out, changing the source group mid-gesture.
 *
 * The release position is the authority, not dnd-kit's drag-active ref — that
 * ref clears asynchronously relative to the drop's pointer-up. The threshold
 * mirrors dnd-kit's own activation distance.
 */
export function useTabPointerActivation(
  onActivate: () => void,
  disabled: boolean,
): (
  event: React.PointerEvent,
  dragListener?: (event: React.PointerEvent<Element>) => void,
) => void {
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanupRef.current?.();
    },
    [],
  );

  return useCallback(
    (event: React.PointerEvent, dragListener?: (event: React.PointerEvent<Element>) => void) => {
      if (disabled || event.button !== 0) return;

      // Start dnd-kit's gesture now; only the activation decision is deferred.
      dragListener?.(event);

      cleanupRef.current?.();
      const startX = event.clientX;
      const startY = event.clientY;

      const cleanup = (): void => {
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        window.removeEventListener("blur", onPointerCancel);
        cleanupRef.current = null;
      };
      const onPointerUp = (upEvent: PointerEvent): void => {
        const wasDrag =
          Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY) >=
          TAB_DRAG_ACTIVATION_DISTANCE;
        cleanup();
        if (!wasDrag) onActivateRef.current();
      };
      const onPointerCancel = (): void => {
        cleanup();
      };

      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("blur", onPointerCancel);
      cleanupRef.current = cleanup;
    },
    [disabled],
  );
}
