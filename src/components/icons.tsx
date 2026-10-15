import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "activity"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up-right"
  | "book-open"
  | "box"
  | "check"
  | "check-circle"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "circle-alert"
  | "circle-help"
  | "clock"
  | "code"
  | "command"
  | "copy"
  | "external-link"
  | "file-code"
  | "file-text"
  | "filter"
  | "github"
  | "globe"
  | "hash"
  | "history"
  | "home"
  | "info"
  | "layers"
  | "layout-dashboard"
  | "lightbulb"
  | "link"
  | "list-filter"
  | "lock"
  | "menu"
  | "message-circle"
  | "moon"
  | "more-horizontal"
  | "panel-left"
  | "pause"
  | "play"
  | "plus"
  | "refresh"
  | "search"
  | "send"
  | "settings"
  | "shield-check"
  | "sliders"
  | "sparkles"
  | "sun"
  | "terminal"
  | "upload-cloud"
  | "x";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

const paths: Record<IconName, ReactElement> = {
  activity: (
    <>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </>
  ),
  "arrow-down": <path d="m6 9 6 6 6-6" />,
  "arrow-left": <path d="m15 18-6-6 6-6M9 12h10" />,
  "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />,
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  "book-open": (
    <>
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H12v17H5.5A2.5 2.5 0 0 0 3 22z" />
      <path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H12v17h6.5A2.5 2.5 0 0 1 21 22z" />
    </>
  ),
  box: (
    <>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  "circle-alert": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4m0 4h.01" />
    </>
  ),
  "circle-help": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.75 9a2.3 2.3 0 1 1 3.6 1.9c-.85.6-1.35 1.05-1.35 2.1m0 2.5h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  code: (
    <>
      <path d="m8 9-4 3 4 3m8-6 4 3-4 3m-3-9-2 12" />
    </>
  ),
  command: (
    <>
      <path d="M18 9a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3z" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  "external-link": <path d="M14 5h5v5m-1-4L11 13M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  "file-code": (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M10 13l-2 2 2 2m4-4 2 2-2 2" />
    </>
  ),
  "file-text": (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </>
  ),
  filter: (
    <>
      <path d="M4 5h16M7 12h10m-7 7h4" />
    </>
  ),
  github: (
    <>
      <path d="M15 22v-4.5c0-1.25-.45-2.1-1.2-2.55 3.9-.45 8-1.9 8-8.5a6.6 6.6 0 0 0-1.75-4.55A6.2 6.2 0 0 0 19.9 0S18.5-.45 15 1.9a16 16 0 0 0-6 0C5.5-.45 4.1 0 4.1 0a6.2 6.2 0 0 0-.15 1.9A6.6 6.6 0 0 0 2.2 6.45c0 6.6 4.1 8.05 8 8.5-.75.45-1.2 1.3-1.2 2.55V22" />
      <path d="M8 19c-3 .95-3-1.5-4.2-1.9" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  hash: (
    <>
      <path d="m10 3-2 18M16 3l-2 18M4 8h16M3 16h16" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5M12 7v5l3 2" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-9h.01" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  "layout-dashboard": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6m-5 3h4M8 14.5A6 6 0 1 1 16 14c-.8.65-1 1.15-1 2H9c0-.85-.25-1.1-1-1.5Z" />
    </>
  ),
  link: <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1m2.5 5.5a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />,
  "list-filter": (
    <>
      <path d="M4 6h16M6 12h12m-9 6h6" />
      <path d="m17 17 2 2 3-3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  "message-circle": (
    <>
      <path d="M20 11.5a8 8 0 0 1-8.5 8 9.5 9.5 0 0 1-4.4-1.1L3 20l1.6-3.7A7.8 7.8 0 0 1 4 12a8 8 0 0 1 8.5-8A8 8 0 0 1 20 11.5Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  moon: (
    <path d="M20 15.4A8.5 8.5 0 0 1 8.6 4 8.5 8.5 0 1 0 20 15.4Z" />
  ),
  "more-horizontal": <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  "panel-left": (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="m9 5 10 7-10 7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.5-3L3 11m0-5v5h5M4 13a8 8 0 0 0 14.5 3L21 13m0 5v-5h-5" />
    </>
  ),
  search: <path d="m20 20-4.5-4.5M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" />,
  send: <path d="m21 3-7 18-4-8-8-4zM21 3 10 13" />,
  settings: (
    <>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1-1.1.6-.2.1a2 2 0 1 1-3.8 0l-.2-.1-1.1-.6-.1.1a2 2 0 1 1-2.8-2.8l.1-.1-.6-1.1-.1-.2a2 2 0 1 1 0-3.8l.1-.2.6-1.1-.1-.1a2 2 0 1 1 2.8-2.8l.1.1 1.1-.6.2-.1a2 2 0 1 1 3.8 0l.2.1 1.1.6.1-.1a2 2 0 1 1 2.8 2.8l-.1.1.6 1.1.1.2a2 2 0 1 1 0 3.8l-.1.2z" />
    </>
  ),
  "shield-check": (
    <>
      <path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3-1.2 4.3L7 8.5l3.8 1.2L12 14l1.2-4.3L17 8.5l-3.8-1.2zM19 14l-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7zM5 14l-.5 1.5L3 16l1.5.5L5 18l.5-1.5L7 16l-1.5-.5z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3m5 0h4" />
    </>
  ),
  "upload-cloud": (
    <>
      <path d="M16 16 12 12 8 16m4-4v9" />
      <path d="M20 16.5A4.5 4.5 0 0 0 18 8h-1.1A6 6 0 1 0 6 17" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
