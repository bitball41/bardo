// Small, self-contained inline icon set for the Diagnostics page — the same
// "inline SVG for one-off marks" convention used elsewhere (e.g. the tab
// position glyphs in settings/sections.tsx), rather than adding a batch of
// new entries to the animated icon registry for icons that only appear here.
import type { ReactNode } from "react";

export type DxIconName =
  | "pulse"
  | "link"
  | "cpu"
  | "shield"
  | "wifi"
  | "database"
  | "layers"
  | "gauge"
  | "list"
  | "chevron";

const PATHS: Record<DxIconName, ReactNode> = {
  pulse: (
    <path d="M2 10h4l2-6 3 12 2-6h5" />
  ),
  link: (
    <>
      <circle cx="4" cy="14.5" r="1.6" />
      <circle cx="10" cy="5.5" r="1.6" />
      <circle cx="16" cy="14.5" r="1.6" />
      <path d="M5.3 13.3 8.8 7M11.2 7l3.5 6.3" />
    </>
  ),
  cpu: (
    <>
      <rect x="5" y="5" width="10" height="10" rx="1.6" />
      <rect x="8.3" y="8.3" width="3.4" height="3.4" rx="0.6" />
      <path d="M10 1v3M10 16v3M1 10h3M16 10h3" />
    </>
  ),
  shield: (
    <path d="M10 2 17 5v5c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V5l7-3Z M7.2 10.2l1.8 1.8 3.6-4.2" />
  ),
  wifi: (
    <>
      <path d="M3 7.2a10 10 0 0 1 14 0" />
      <path d="M5.8 10.4a6 6 0 0 1 8.4 0" />
      <path d="M8.6 13.6a2.3 2.3 0 0 1 2.8 0" />
      <circle cx="10" cy="16.3" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  database: (
    <>
      <ellipse cx="10" cy="5" rx="7" ry="2.6" />
      <path d="M3 5v10c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V5" />
      <path d="M3 10c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" />
    </>
  ),
  layers: (
    <>
      <path d="M10 2 18 6l-8 4-8-4 8-4Z" />
      <path d="M2 10l8 4 8-4" />
      <path d="M2 14l8 4 8-4" />
    </>
  ),
  gauge: (
    <>
      <path d="M3 15a7 7 0 0 1 14 0" />
      <path d="M10 15 13 9" />
      <circle cx="10" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  list: (
    <>
      <circle cx="3" cy="5" r="1" fill="currentColor" stroke="none" />
      <path d="M6.5 5H17" />
      <circle cx="3" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d="M6.5 10H17" />
      <circle cx="3" cy="15" r="1" fill="currentColor" stroke="none" />
      <path d="M6.5 15H17" />
    </>
  ),
  chevron: <path d="M6 8 10 12 14 8" />,
};

export function DxIcon({ name, size = 16, className }: { name: DxIconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
