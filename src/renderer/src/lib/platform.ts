/** The OS this window is running on; the frame and traffic lights follow it. */
export const IS_MAC = navigator.userAgent.includes("Mac");

/** Room for the native macOS traffic lights, kept in physical window pixels. */
export const MAC_INSET = "calc(78px / var(--ui-zoom-factor, 1))";
