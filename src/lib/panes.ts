import type { IconName } from "@/components/icons";

export type PaneId =
  | "themes"
  | "appearance"
  | "widgets"
  | "toolbar"
  | "privacy"
  | "history"
  | "cloaker"
  | "safety"
  | "bookmarks"
  | "search"
  | "layout"
  | "advanced"
  | "diagnostics";

export interface PaneMeta {
  id: PaneId;
  label: string;
  icon: IconName;
  desc: string;
  /** Sections users can pin to the toolbar as popover buttons. */
  pinnable: boolean;
}

export const SIDEBAR_GROUPS: { group: string; items: PaneMeta[] }[] = [
  {
    group: "look",
    items: [
      { id: "themes", label: "themes", icon: "sun-medium", desc: "colors", pinnable: true },
      { id: "appearance", label: "look", icon: "square-pen", desc: "accent and wallpaper", pinnable: true },
      { id: "widgets", label: "widgets", icon: "layout-grid", desc: "new tab extras", pinnable: true },
      { id: "layout", label: "layout", icon: "layout-panel-top", desc: "where tabs go", pinnable: true },
      { id: "toolbar", label: "toolbar", icon: "grip", desc: "the buttons up top", pinnable: false },
    ],
  },
  {
    group: "browse",
    items: [
      { id: "search", label: "search", icon: "search", desc: "search engine", pinnable: true },
      { id: "bookmarks", label: "bookmarks", icon: "bookmark", desc: "saved pages", pinnable: true },
      { id: "history", label: "history", icon: "history", desc: "where you went", pinnable: true },
    ],
  },
  {
    group: "privacy",
    items: [
      { id: "privacy", label: "privacy", icon: "key-circle", desc: "what stays here", pinnable: true },
      { id: "cloaker", label: "disguise", icon: "eye", desc: "hide the tab", pinnable: true },
      { id: "safety", label: "quick exit", icon: "badge-alert", desc: "leave in a hurry", pinnable: true },
    ],
  },
  {
    group: "system",
    items: [
      { id: "diagnostics", label: "diagnostics", icon: "check", desc: "if something's off", pinnable: false },
      { id: "advanced", label: "engine", icon: "file-cog", desc: "how pages load", pinnable: true },
    ],
  },
];

const ALL_PANES = SIDEBAR_GROUPS.flatMap((g) => g.items);

export const PANE_BY_ID = Object.fromEntries(ALL_PANES.map((p) => [p.id, p])) as Record<PaneId, PaneMeta>;

export const PINNABLE_PANES = ALL_PANES.filter((p) => p.pinnable);
