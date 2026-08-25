import type { EngineName, Settings, TabPosition, ThemeName } from "./types";

export const PUBLIC_WISP_SERVERS = [
  "wss://wisp.mercurywork.shop/wisp/",
  "wss://anura.pro/wisp/",
  "wss://nebulaservices.org/wisp/",
  "wss://wisp.terbiumon.top/wisp/",
];

export const SVC_PREFIX = "/scramjet/service/";
/** Neutral page-facing prefix — proxied documents must not advertise "sherpa". */
export const SVC_PREFIX_SHERPA = "/runtime/service/";
export const SVC_PREFIX_KLYSTRON = "/klystron/";
export const SVC_PREFIX_OPULENT = "/opulent/";

/** Paths injected into every Sherpa-proxied document (keep brand-neutral). */
export const SHERPA_FILES = {
  wasm: "/runtime/wasm.wasm",
  all: "/runtime/all.js",
  sync: "/runtime/sync.js",
} as const;

export interface EngineInfo {
  id: EngineName;
  name: string;
  hint: string;
  /** Client-side engines run the proxy in-browser over Wisp; server-side engines fetch and rewrite on Bardo's own server. */
  kind: "client" | "server";
  version: string;
  swPath: string;
  swScope: string;
}

export const ENGINES: EngineInfo[] = [
  { id: "sherpa", name: "Sherpa", hint: "Default — owned Scramjet fork", kind: "client", version: "1.1.0-sherpa.3", swPath: "/sw-sherpa.js", swScope: SVC_PREFIX_SHERPA },
  { id: "scramjet", name: "Scramjet v1", hint: "Stable alternative", kind: "client", version: "1.1.0", swPath: "/sw.js", swScope: SVC_PREFIX },
  { id: "klystron", name: "Klystron", hint: "Server-side — beta", kind: "server", version: "in-repo", swPath: "/sw-klystron.js", swScope: SVC_PREFIX_KLYSTRON },
  { id: "opulent", name: "OpulentAPI", hint: "Server-side — JS rendering, beta", kind: "server", version: "in-repo", swPath: "/sw-opulent.js", swScope: SVC_PREFIX_OPULENT },
];

export const ENGINE_BY_ID = Object.fromEntries(ENGINES.map((e) => [e.id, e])) as Record<EngineName, EngineInfo>;

export const BARDO_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
      `<path d='M8 34 L8 19 Q8 6 20 6 Q32 6 32 19 L32 34' stroke='white' stroke-width='2.5' fill='none' stroke-linecap='round'/>` +
      `<line x1='4' y1='34' x2='36' y2='34' stroke='white' stroke-width='2.5' stroke-linecap='round'/></svg>`,
  );

export const SEARCH_ENGINES: Record<string, (q: string) => string> = {
  duckduckgo: (q) => "https://duckduckgo.com/?q=" + encodeURIComponent(q),
  google: (q) => "https://www.google.com/search?q=" + encodeURIComponent(q),
  bing: (q) => "https://www.bing.com/search?q=" + encodeURIComponent(q),
  brave: (q) => "https://search.brave.com/search?q=" + encodeURIComponent(q),
  startpage: (q) => "https://www.startpage.com/search?q=" + encodeURIComponent(q),
};

export function gFav(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export interface Cloak {
  title: string;
  favicon: string | null;
}

export const TAB_CLOAKS: Record<string, Cloak> = {
  none: { title: "Bardo", favicon: null },
  canvas: { title: "Dashboard - Canvas", favicon: gFav("instructure.com") },
  gdrive: { title: "My Drive - Google Drive", favicon: gFav("drive.google.com") },
  canva: { title: "Home - Canva", favicon: gFav("canva.com") },
  classlink: { title: "ClassLink Launchpad", favicon: gFav("launchpad.classlink.com") },
  blooket: { title: "Blooket", favicon: gFav("blooket.com") },
  classroom: { title: "Google Classroom", favicon: gFav("classroom.google.com") },
  docs: { title: "Untitled document - Google Docs", favicon: gFav("docs.google.com") },
};

export interface ThemeDef {
  id: ThemeName;
  label: string;
  mode: "dark" | "light";
  group: "neutral" | "color";
  bg: string;
  surface: string;
  text: string;
  muted: string;
  hover: string;
  active: string;
  accent: string;
  border: string;
}

export const THEMES: ThemeDef[] = [
  { id: "dark", label: "Dark", mode: "dark", group: "neutral", bg: "#000", surface: "#111", text: "#fff", muted: "#999", hover: "#1c1c1c", active: "#252525", accent: "#4466ff", border: "#333" },
  { id: "slate", label: "Slate", mode: "dark", group: "neutral", bg: "#1b1b1f", surface: "#232328", text: "#d4d4d8", muted: "#8a8a96", hover: "#26262c", active: "#2f2f37", accent: "#4a9eff", border: "#34343c" },
  { id: "graphite", label: "Graphite", mode: "dark", group: "neutral", bg: "#161616", surface: "#1e1e1e", text: "#e0e0e0", muted: "#888888", hover: "#242424", active: "#2c2c2c", accent: "#9aa0a6", border: "#333" },
  { id: "macchiato", label: "Macchiato", mode: "dark", group: "neutral", bg: "#1e2030", surface: "#24273a", text: "#cad3f5", muted: "#8087a2", hover: "#2a2d42", active: "#363a4f", accent: "#c6a0f6", border: "#363a4f" },
  { id: "mocha", label: "Mocha", mode: "dark", group: "neutral", bg: "#181825", surface: "#1e1e2e", text: "#cdd6f4", muted: "#7f849c", hover: "#242436", active: "#313244", accent: "#cba6f7", border: "#313244" },
  { id: "space", label: "Deep Space", mode: "dark", group: "color", bg: "#09003d", surface: "#0e0050", text: "#e8e0ff", muted: "#9080d0", hover: "#130064", active: "#1c0080", accent: "#7c5fe6", border: "#2c0090" },
  { id: "midnight", label: "Midnight", mode: "dark", group: "color", bg: "#080d1a", surface: "#0d1525", text: "#c8d8f8", muted: "#6688bb", hover: "#101828", active: "#15203a", accent: "#4488ff", border: "#1e2d4e" },
  { id: "aurora", label: "Aurora", mode: "dark", group: "color", bg: "#0a0a14", surface: "#10101e", text: "#e8e0ff", muted: "#8888cc", hover: "#14142a", active: "#1a1a38", accent: "#8855ff", border: "#252545" },
  { id: "forest", label: "Forest", mode: "dark", group: "color", bg: "#020d04", surface: "#061209", text: "#c8f0d4", muted: "#5a9068", hover: "#081a0a", active: "#0c2410", accent: "#30c55a", border: "#0e2814" },
  { id: "crimson", label: "Crimson", mode: "dark", group: "color", bg: "#0d0202", surface: "#140404", text: "#f5d8d8", muted: "#9a5050", hover: "#1c0606", active: "#240a0a", accent: "#e03838", border: "#2d0808" },
  { id: "ember", label: "Ember", mode: "dark", group: "color", bg: "#0d0500", surface: "#140800", text: "#f5e8d0", muted: "#9a6830", hover: "#1c0a00", active: "#241200", accent: "#e07820", border: "#2d1500" },
  { id: "rose", label: "Rose", mode: "dark", group: "color", bg: "#0d0208", surface: "#140410", text: "#f5d8ee", muted: "#9a5080", hover: "#1c0618", active: "#240a22", accent: "#e03880", border: "#2d0824" },
  { id: "light", label: "Light", mode: "light", group: "neutral", bg: "#f0f2f5", surface: "#fff", text: "#111", muted: "#60607a", hover: "#e8e8f0", active: "#dcdce8", accent: "#4455ee", border: "#c0c0ce" },
  { id: "latte", label: "Latte", mode: "light", group: "neutral", bg: "#cdd2dc", surface: "#dce0e8", text: "#4c4f69", muted: "#6c6f85", hover: "#d3d7e0", active: "#c8cdd8", accent: "#8839ef", border: "#bcc0cc" },
  { id: "cappuccino", label: "Cappuccino", mode: "light", group: "neutral", bg: "#d6cab4", surface: "#e3d9c8", text: "#3b2f25", muted: "#8a7a66", hover: "#dacfba", active: "#cfc3aa", accent: "#a9744f", border: "#c9bba6" },
  { id: "stone", label: "Stone", mode: "light", group: "neutral", bg: "#d6d6d1", surface: "#e2e2de", text: "#33332f", muted: "#7a7a73", hover: "#d9d9d3", active: "#cecec8", accent: "#5b6472", border: "#c2c2bc" },
  { id: "fog", label: "Fog", mode: "light", group: "neutral", bg: "#d6d9df", surface: "#e4e6ea", text: "#2b2d31", muted: "#6b6e76", hover: "#dbdde2", active: "#d0d3d9", accent: "#1f6feb", border: "#c8cbd1" },
  { id: "nebula", label: "Nebula", mode: "light", group: "color", bg: "#f3f0fb", surface: "#fbf9ff", text: "#1a1330", muted: "#6f5f9a", hover: "#ebe4f8", active: "#e0d5f2", accent: "#6d4fd6", border: "#d9cdf0" },
  { id: "daylight", label: "Daylight", mode: "light", group: "color", bg: "#eef4fb", surface: "#fbfdff", text: "#0f1b2e", muted: "#5a7196", hover: "#e3edf8", active: "#d6e4f4", accent: "#2f7ae0", border: "#c8d8ee" },
  { id: "dawn", label: "Dawn", mode: "light", group: "color", bg: "#f4f0fb", surface: "#fdfbff", text: "#1c1430", muted: "#71609c", hover: "#ece4f8", active: "#e2d6f4", accent: "#7a3fe0", border: "#dcd0f2" },
  { id: "meadow", label: "Meadow", mode: "light", group: "color", bg: "#eef7f0", surface: "#fbfffc", text: "#0d2014", muted: "#4f8064", hover: "#e3f2e7", active: "#d6ebdd", accent: "#1ea34a", border: "#cae6d3" },
  { id: "blush", label: "Blush", mode: "light", group: "color", bg: "#fbf0f0", surface: "#fffbfb", text: "#2e1212", muted: "#996060", hover: "#f8e4e4", active: "#f4d6d6", accent: "#d12d2d", border: "#eed0d0" },
  { id: "sand", label: "Sand", mode: "light", group: "color", bg: "#fbf5ee", surface: "#fffdfb", text: "#2e1f0d", muted: "#997a4f", hover: "#f8efe3", active: "#f4e6d6", accent: "#c25e10", border: "#eedfca" },
  { id: "petal", label: "Petal", mode: "light", group: "color", bg: "#fbf0f6", surface: "#fffbfd", text: "#2e1224", muted: "#996084", hover: "#f8e4f0", active: "#f4d6e8", accent: "#d12d72", border: "#eed0e2" },
];

export const DARK_THEMES = THEMES.filter((t) => t.mode === "dark");
export const LIGHT_THEMES = THEMES.filter((t) => t.mode === "light");

export const THEME_COLUMNS = [
  { mode: "dark" as const, head: "Dark", themes: DARK_THEMES },
  { mode: "light" as const, head: "Light", themes: LIGHT_THEMES },
];

const RECOMMENDED_IDS: ThemeName[] = ["dark", "slate", "macchiato", "space", "aurora", "rose"];
export const RECOMMENDED_THEMES = RECOMMENDED_IDS.map((id) => THEMES.find((t) => t.id === id)!);

export const ACCENTS = [
  { value: "#4466ff", title: "Blue" },
  { value: "#7c5fe6", title: "Violet" },
  { value: "#e03880", title: "Pink" },
  { value: "#e03838", title: "Red" },
  { value: "#e07820", title: "Orange" },
  { value: "#30c55a", title: "Green" },
  { value: "#22b8c8", title: "Cyan" },
];

/**
 * Phones default to bottom tabs: a top tab strip plus toolbar crowds the
 * viewport, and vertical rails eat half the width. Saved settings always
 * store tabPosition explicitly, so this only affects first runs and resets.
 */
function defaultTabPosition(): TabPosition {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "top";
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const phone = window.matchMedia("(max-width: 640px), (max-height: 500px)").matches;
    return touch && phone ? "bottom" : "top";
  } catch {
    return "top";
  }
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  aboutBlankMode: false,
  aboutBlankTitle: "",
  aboutBlankFavicon: "",
  aboutBlankRememberCloak: true,
  tabCloak: "none",
  bookmarksVisible: false,
  bookmarks: [],
  searchEngine: "startpage",
  panicKey: "",
  panicUrl: "https://classroom.google.com",
  erudaEnabled: false,
  engine: "sherpa",
  tabPosition: defaultTabPosition(),
  ntClock: false,
  restoreTabs: true,
  historyEnabled: true,
  sessionOnly: false,
  moreContrast: false,
  widgetQuickLinks: false,
  widgetNotes: false,
  widgetWeather: false,
  widgetDate: false,
  widgetTodo: false,
  widgetPomodoro: false,
  widgetBattery: false,
  wallpaperType: "none",
  accent: "",
  sidebarCollapsed: false,
};

export const SETTINGS_KEY = "bardo-settings";
export const SESSION_KEY = "bardo-session";
export const HISTORY_KEY = "bardo-history";
export const NOTES_KEY = "bardo-notes";
export const TODOS_KEY = "bardo-todos";
export const WALLPAPER_KEY = "bardo-wallpaper";
export const WEATHER_KEY = "bardo-weather";
export const SHORTCUTS_KEY = "bardo-shortcuts";
export const TOOLBAR_KEY = "bardo-toolbar";
export const CUSTOM_THEMES_KEY = "bardo-custom-themes";
export const TAB_GROUPS_KEY = "bardo-tab-groups";
export const HISTORY_MAX = 200;

export function wmo(code: number): { icon: WeatherIcon; text: string } {
  if (code === 0) return { icon: "cloud-sun", text: "Clear" };
  if (code <= 2) return { icon: "cloud-sun", text: "Partly cloudy" };
  if (code === 3) return { icon: "cloud-sun", text: "Overcast" };
  if (code <= 48) return { icon: "cloud-sun", text: "Fog" };
  if (code <= 57) return { icon: "cloud-rain", text: "Drizzle" };
  if (code <= 67) return { icon: "cloud-rain", text: "Rain" };
  if (code <= 77) return { icon: "cloud-snow", text: "Snow" };
  if (code <= 82) return { icon: "cloud-rain", text: "Showers" };
  if (code <= 86) return { icon: "cloud-snow", text: "Snow showers" };
  if (code <= 99) return { icon: "cloud-lightning", text: "Thunderstorm" };
  return { icon: "cloud-sun", text: "" };
}

export type WeatherIcon =
  | "cloud-sun"
  | "cloud-rain"
  | "cloud-snow"
  | "cloud-lightning";
