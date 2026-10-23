import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MenuList, type MenuItem } from "./Menu";

/**
 * The same actions as `Menu`, opened where the pointer is rather than from a
 * trigger. A file manager's rows carry no permanent button; right-clicking a
 * row is the gesture that asks what can be done to it.
 *
 * It is portalled to the body so a scrolling tree cannot clip it, positioned
 * fixed so the coordinates are the pointer's, and focused on the first item so
 * the keyboard can finish what the pointer started. Escape and Tab give focus
 * back to the row; choosing an item does not, because the action's own surface
 * (a dialog, an inline input) takes it from there.
 */
export function ContextMenu({
  point,
  label,
  items,
  onClose,
  returnFocus,
}: {
  /** Viewport coordinates of the pointer, or of the row for a keyboard open. */
  point: { x: number; y: number };
  label: string;
  items: MenuItem[];
  onClose: () => void;
  /** Where Escape and Tab hand the keyboard back to. */
  returnFocus: HTMLElement | null;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef(false);
  const [position, setPosition] = useState(point);

  // Measure before paint, then keep the menu inside the window: a right-click
  // near the bottom edge would otherwise open away from the pointer.
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const margin = 8;
    setPosition({
      x: Math.max(margin, Math.min(point.x, window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(point.y, window.innerHeight - height - margin)),
    });
    const first = element.querySelector<HTMLButtonElement>(
      '[role^="menuitem"]:not(:disabled)',
    );
    (first ?? element).focus();
  }, [point.x, point.y]);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!listRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        restoreFocus.current = true;
        onClose();
        return;
      }
      const items = Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role^="menuitem"]:not(:disabled)',
        ) ?? [],
      );
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const focusAt = (next: number) => {
        event.preventDefault();
        items[(next + items.length) % items.length]?.focus();
      };
      if (event.key === "ArrowDown") focusAt(index < 0 ? 0 : index + 1);
      else if (event.key === "ArrowUp") focusAt(index < 0 ? items.length - 1 : index - 1);
      else if (event.key === "Home") focusAt(0);
      else if (event.key === "End") focusAt(items.length - 1);
    };
    const closeOnScroll = (event: Event) => {
      // The menu itself may scroll when it is taller than the window.
      if (listRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const closeOnResize = () => onClose();
    window.addEventListener("mousedown", closeOnOutside, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("mousedown", closeOnOutside, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [onClose]);

  useEffect(
    () => () => {
      if (restoreFocus.current) returnFocus?.focus();
    },
    [returnFocus],
  );

  return createPortal(
    <MenuList
      listRef={listRef}
      className="menu__list--fixed"
      style={{ left: position.x, top: position.y }}
      label={label}
      items={items}
      onSelect={onClose}
    />,
    document.body,
  );
}
