/**
 * The brand symbol, taken from the identity kit (`brand/final/colabdesk-symbol-small.svg`).
 *
 * This is the small-size cut rather than the master on purpose: the master is drawn for 24 px
 * and up, and this sits in a 40 px bar. The cut thickens the wall, opens the room and widens
 * the clearance so the frame, the interrupted wall and the block all survive at this size —
 * see the minimum-size table in `brand/guidelines.md`.
 *
 * Filled and on `currentColor`, unlike the chrome's stroked icons: a brand mark is not a
 * control, so it does not share the `Svg` wrapper in `components/ui/icons.tsx` and must not be
 * restyled as one.
 */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fillRule="evenodd"
        d="M 112 8 H 216 A 32 32 0 0 1 248 40 V 216 A 32 32 0 0 1 216 248 H 112 A 32 32 0 0 1 80 216 V 180 H 116 V 76 H 80 V 40 A 32 32 0 0 1 112 8 Z M 116 44 H 212 V 212 H 116 Z"
      />
      <path d="M 8 96 H 172 V 160 H 8 Z" />
    </svg>
  );
}
