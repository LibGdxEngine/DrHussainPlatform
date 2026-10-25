import type { SVGProps } from "react";

/** Stroke icons on a 24x24 grid. Add new icons here, never inline <svg> in screens. */
export const iconPaths = {
  today: "M3 4h7v8H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  patients:
    "M9 4a4 4 0 1 1 0 8a4 4 0 0 1 0-8M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5.5",
  appts:
    "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 9h18M8 2v4M16 2v4",
  docs: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6",
  msgs: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 7l9 6 9-6",
  settings:
    "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4a2 2 0 1 1 0 4a2 2 0 0 1 0-4M9 10a2 2 0 1 1 0 4a2 2 0 0 1 0-4M17 16a2 2 0 1 1 0 4a2 2 0 0 1 0-4",
  audit: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11",
  search: "M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14M21 21l-4.3-4.3",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l5 5L20 7",
  lock: "M6 11h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4",
  key: "M8 11a4 4 0 1 1 0 8a4 4 0 0 1 0-8M11 12l9-9M16 7l3 3",
  arrowUpLeft: "M17 17L7 7M7 16V7h9",
  chevronLeft: "M15 6l-6 6 6 6",
} as const;

export type IconName = keyof typeof iconPaths;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 19, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
