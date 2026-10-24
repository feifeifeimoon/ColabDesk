/**
 * The chrome's icons, as inline SVG on `currentColor`.
 *
 * Unicode glyphs (`▤`, `▥`, `⚙`) render differently on every platform and fall
 * back to whatever the system font has; the top bar is made of icons, so they
 * are drawn instead.
 */

type IconProps = { size?: number; className?: string };

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Sync / reconcile sessions with the server. */
export function SyncIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M2.5 7.5a5.5 5.5 0 0 1 9.4-3.4L13.5 5.5" />
      <path d="M10.5 5.5h3v-3" />
      <path d="M13.5 8.5a5.5 5.5 0 0 1-9.4 3.4L2.5 10.5" />
      <path d="M5.5 10.5h-3v3" />
    </Svg>
  );
}

/** Collapse/expand the left rail: a panel with its divider. */
export function PanelLeftIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.75" />
      <path d="M6.25 2.75v10.5" />
    </Svg>
  );
}

/** Collapse/expand the right panel, mirrored. */
export function PanelRightIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.75" />
      <path d="M9.75 2.75v10.5" />
    </Svg>
  );
}

/** Settings. A ring with teeth, not a circle with rays: at 15px the latter is
    indistinguishable from the theme toggle's sun. */
export function SettingsIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="4.6" />
      <circle cx="8" cy="8" r="1.75" />
      <path d="M8 1.6v1.9M12.53 3.47l-1.35 1.35M14.4 8h-1.9M12.53 12.53l-1.35-1.35M8 14.4v-1.9M3.47 12.53l1.35-1.35M1.6 8h1.9M3.47 3.47l1.35 1.35" />
    </Svg>
  );
}

/** Appearance: a half-filled disc. The section is not the toggle, so it does
    not borrow the toggle's sun. */
export function ContrastIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* ---- settings sections ---- */

export function ChevronLeftIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </Svg>
  );
}

/** Search: the two directions a match can be in. */
export function ChevronUpIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3.5 10 8 5.5l4.5 4.5" />
    </Svg>
  );
}

export function ChevronDownIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3.5 6 8 10.5 12.5 6" />
    </Svg>
  );
}

/** A tree row's twisty: a right chevron, rotated by the row when it is open. */
export function ChevronRightIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Svg>
  );
}

/* ---- the file tree ---- */

/** A closed folder. */
export function FolderClosedIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M1.9 12.3V4.6a1 1 0 0 1 1-1h2.6l1.3 1.5h6.3a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H2.9a1 1 0 0 1-1-1Z" />
    </Svg>
  );
}

/** The same folder, opened: the front leaf tilts away. */
export function FolderOpenIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M1.9 12.3V4.6a1 1 0 0 1 1-1h2.6l1.3 1.5h4.6a1 1 0 0 1 1 1v1" />
      <path d="M3.4 13.3h9.3a1 1 0 0 0 1-.8l.8-4a1 1 0 0 0-1-1.2H5.1a1 1 0 0 0-1 .8l-.8 4a1 1 0 0 0 1 1.2Z" />
    </Svg>
  );
}

/** A file: one page with a turned corner. */
export function FileIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M9.2 1.9H4.4a1 1 0 0 0-1 1v10.2a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1V5.3Z" />
      <path d="M9.2 1.9v3.4h3.4" />
    </Svg>
  );
}

/** A symbolic link: two rings joined by a bar. */
export function LinkIcon({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M6.6 9.4a2.4 2.4 0 0 0 3.4 0l2-2a2.4 2.4 0 0 0-3.4-3.4l-.7.7" />
      <path d="M9.4 6.6a2.4 2.4 0 0 0-3.4 0l-2 2a2.4 2.4 0 0 0 3.4 3.4l.7-.7" />
    </Svg>
  );
}

/** Account and quota. */
export function AccountIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="5.4" r="2.6" />
      <path d="M2.9 13.6a5.1 5.1 0 0 1 10.2 0" />
    </Svg>
  );
}

/** Spend over time. */
export function ChartIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M2.5 13.5h11" />
      <path d="M4.75 13.5V8.5M8 13.5V3.5M11.25 13.5v-3.5" />
    </Svg>
  );
}

/** The terminal: a prompt chevron over a cursor line. */
export function TerminalIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.75" />
      <path d="M5 6.5 6.75 8 5 9.5M8.75 9.75h2.5" />
    </Svg>
  );
}

/** The shortcut reference: a keyboard with a space bar. */
export function KeyboardIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="1.75" y="4.25" width="12.5" height="7.5" rx="1.5" />
      <path d="M4 6.75h.01M6 6.75h.01M8 6.75h.01M10 6.75h.01M12 6.75h.01M4.5 9.25h.01M11.5 9.25h.01M6.5 9.25h3" />
    </Svg>
  );
}

/** The runtime and its CLI. */
export function ChipIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="4.75" y="4.75" width="6.5" height="6.5" rx="1" />
      <path d="M6.75 1.9v2.85M9.25 1.9v2.85M6.75 11.25v2.85M9.25 11.25v2.85M1.9 6.75h2.85M1.9 9.25h2.85M11.25 6.75h2.85M11.25 9.25h2.85" />
    </Svg>
  );
}

/** A GPU: a card with one fan and its display ports, not a second chip. */
export function GpuIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="1.9" y="4.4" width="12.2" height="7.2" rx="1" />
      <circle cx="5.7" cy="8" r="2.3" />
      <path d="M10.3 6.2h1.7M10.3 8h1.7M10.3 9.8h1.7" />
    </Svg>
  );
}

/** A TPU: a tensor as a cube — the array is the machine. */
export function TpuIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 1.9 13.3 4.6v6.8L8 14.1 2.7 11.4V4.6Z" />
      <path d="M2.7 4.6 8 7.3l5.3-2.7M8 7.3v6.8" />
    </Svg>
  );
}

/** Active tasks / sessions pulse. */
export function ActivityIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M2 8.5h3l2-4.5 2.5 8 1.5-3.5h5" />
    </Svg>
  );
}

/** Outside tools that reach the runtime over the same SSH config. */
export function PlugIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M5.5 2.5v3M10.5 2.5v3" />
      <path d="M3.75 5.5h8.5v1.75a4.25 4.25 0 0 1-4.25 4.25A4.25 4.25 0 0 1 3.75 7.25Z" />
      <path d="M8 11.5v2" />
    </Svg>
  );
}

/* ---- the start page ---- */

/** Star the project on GitHub. */
export function StarIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 2.1 9.5 6.2l4.4.2-3.5 2.7 1.2 4.2L8 10.9l-3.6 2.4 1.2-4.2-3.5-2.7 4.4-.2Z" />
    </Svg>
  );
}

/** The runtime's filesystem. A folder, so it cannot read as a panel toggle. */
export function FolderIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M2 4.6a1.4 1.4 0 0 1 1.4-1.4h2.7l1.5 1.8h4.6a1.4 1.4 0 0 1 1.4 1.4v5.4a1.4 1.4 0 0 1-1.4 1.4H3.4A1.4 1.4 0 0 1 2 11.8Z" />
    </Svg>
  );
}

export function PlusIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Svg>
  );
}

export function CloseIcon({ size = 12 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

/** Restart the remote kernel: one circular arrow, not Sync's two. */
export function RestartIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M13.66 2.67v4h-4" />
      <path d="M13.66 10a6 6 0 1 1-1.41-6.24" />
    </Svg>
  );
}

/** The SSH key written to the local config. */
export function KeyIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="5" cy="8" r="2.4" />
      <path d="M7.4 8h6.1M11.4 8v2.1M13.5 8v1.4" />
    </Svg>
  );
}

/** Copy the ssh command: two offset sheets, not one file. */
export function CopyIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="5.5" y="2.5" width="8" height="8" rx="1.5" />
      <path d="M3.5 5.5H3A1.5 1.5 0 0 0 1.5 7v6A1.5 1.5 0 0 0 3 14.5h6a1.5 1.5 0 0 0 1.5-1.5v-.5" />
    </Svg>
  );
}

/** Stop the runtime: a filled square, distinct from the close X. */
export function StopIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** More actions: three dots, not the menu's typographic ellipsis. */
export function MoreIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="3.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A new folder: the folder outline with a plus inside. */
export function FolderPlusIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M1.9 12.3V4.6a1 1 0 0 1 1-1h2.6l1.3 1.5h6.3a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H2.9a1 1 0 0 1-1-1Z" />
      <path d="M8 7.2v4M6 9.2h4" />
    </Svg>
  );
}

/** Upload: an arrow leaving a tray. The mirror of Download. */
export function UploadIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 10.5V3.2" />
      <path d="M5.3 5.9 8 3.2l2.7 2.7" />
      <path d="M2.8 10.7v1.9h10.4v-1.9" />
    </Svg>
  );
}

/** Download: an arrow landing in a tray. */
export function DownloadIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 3.2v7.3" />
      <path d="M5.3 7.8 8 10.5l2.7-2.7" />
      <path d="M2.8 10.7v1.9h10.4v-1.9" />
    </Svg>
  );
}

/** Delete: a lidded bin, distinct from Stop's filled square. */
export function TrashIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M2.8 4.6h10.4" />
      <path d="M6.2 4.6V3.3h3.6v1.3" />
      <path d="M4.2 4.6l.6 8.1h6.4l.6-8.1" />
      <path d="M6.8 6.9v3.5M9.2 6.9v3.5" />
    </Svg>
  );
}

/** A checked menu item: one tick, no box. */
export function CheckIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3.2 8.4 6.4 11.4 12.8 4.6" />
    </Svg>
  );
}

/* ---- window controls (the app draws its own title bar) ---- */

export function MinimizeIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3.5 8h9" />
    </Svg>
  );
}

export function MaximizeIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="3.5" width="9" height="9" rx="0.5" />
    </Svg>
  );
}

export function RestoreIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="3" y="5.5" width="7.5" height="7.5" rx="0.5" />
      <path d="M5.75 5.5V3.5h7.25v7.25h-2" />
    </Svg>
  );
}

export function CloseWindowIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}
