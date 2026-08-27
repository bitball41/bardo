export type ThemeName =
  | "dark"
  | "slate"
  | "graphite"
  | "macchiato"
  | "mocha"
  | "space"
  | "midnight"
  | "aurora"
  | "forest"
  | "crimson"
  | "ember"
  | "rose"
  | "light"
  | "latte"
  | "cappuccino"
  | "stone"
  | "fog"
  | "nebula"
  | "daylight"
  | "dawn"
  | "meadow"
  | "blush"
  | "sand"
  | "petal";

export type TabPosition = "top" | "bottom" | "left" | "right";
export type EngineName = "scramjet" | "klystron" | "sherpa";
export type WallpaperType = "none" | "gradient" | "image";
/** How Bardo handles tabs from the previous session on launch. */
export type RestoreTabsMode = "ask" | "always" | "never";

export type CustomThemeId = `custom:${string}`;
export type ThemeMode = "dark" | "light";
export type Density = "compact" | "comfortable" | "spacious";
export type AnimationLevel = "full" | "reduced" | "none";

export interface CustomThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  hover: string;
  active: string;
  accent: string;
  accentContrast: string;
}

export interface CustomTheme {
  id: CustomThemeId;
  name: string;
  mode: ThemeMode;
  /** Built-in theme this was derived from; used by the editor's Reset action. */
  base: string;
  colors: CustomThemeColors;
  radius: number;
  density: Density;
  font: string;
  glass: { enabled: boolean; blur: number; opacity: number };
  animation: AnimationLevel;
}

export interface ScramjetController {
  encodeUrl(url: string): string;
  decodeUrl(url: string): string;
  createFrame(iframe: HTMLIFrameElement): ScramjetFrame;
  init(): Promise<void>;
}

export interface ScramjetFrame {
  go(url: string): void;
  reload(): void;
  back(): void;
  forward(): void;
  addEventListener(type: "urlchange", fn: (e: { url: string }) => void): void;
}

export interface UrlCodec {
  encode: (url: string) => string;
  decode: (url: string) => string;
}

export interface ScramjetControllerFactory {
  ScramjetController: new (opts: {
    prefix: string;
    files: { wasm: string; all: string; sync: string };
    flags?: EngineRewriteFlags;
    codec?: UrlCodec;
  }) => ScramjetController;
}

export interface EngineRewriteFlags {
  /** Original-source mappings are useful for debugging but expensive in normal browsing. */
  sourcemaps?: boolean;
  /** Diagnostic try/catch wrappers add page code when debugging is disabled. */
  captureErrors?: boolean;
}

export interface SherpaController {
  encodeUrl(url: string): string;
  decodeUrl(url: string): string;
  createFrame(iframe: HTMLIFrameElement): ScramjetFrame;
  init(): Promise<void>;
}

export interface SherpaControllerFactory {
  SherpaController: new (opts: {
    prefix: string;
    files: { wasm: string; all: string; sync: string };
    globals?: Record<string, string>;
    errorPage?: Record<string, string>;
    flags?: EngineRewriteFlags;
    codec?: UrlCodec;
  }) => SherpaController;
}

export interface BareMuxConnection {
  setTransport(path: string, args: [{ wisp: string }]): Promise<void>;
}

export interface Bookmark {
  id: number;
  title: string;
  url: string;
  folder?: string;
  pinnedNewTab?: boolean;
}

export interface TabGroup {
  id: string;
  name: string;
  collapsed: boolean;
  color: string;
}

export interface SavedTabGroup {
  id: string;
  name: string;
  tabs: Array<Pick<TabView, "title" | "url" | "favicon">>;
  savedAt: number;
  color: string;
}

export interface Settings {
  theme: ThemeName | CustomThemeId;
  aboutBlankMode: boolean;
  aboutBlankTitle: string;
  aboutBlankFavicon: string;
  aboutBlankRememberCloak: boolean;
  tabCloak: string;
  bookmarksVisible: boolean;
  bookmarks: Bookmark[];
  searchEngine: string;
  panicKey: string;
  panicUrl: string;
  erudaEnabled: boolean;
  engine: EngineName;
  tabPosition: TabPosition;
  ntClock: boolean;
  restoreTabs: RestoreTabsMode;
  historyEnabled: boolean;
  sessionOnly: boolean;
  moreContrast: boolean;
  widgetQuickLinks: boolean;
  widgetNotes: boolean;
  widgetWeather: boolean;
  widgetDate: boolean;
  widgetTodo: boolean;
  widgetPomodoro: boolean;
  widgetBattery: boolean;
  wallpaperType: WallpaperType;
  accent: string;
  sidebarCollapsed: boolean;
}

export interface HistoryEntry {
  url: string;
  title: string;
  ts: number;
}

export interface Shortcut {
  label: string;
  url: string;
  icon?: string;
}

export interface TabView {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  active: boolean;
  pinned: boolean;
  groupId: string | null;
  suspended: boolean;
}

export interface InternalTab {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  iframe: HTMLIFrameElement;
  frame: ScramjetFrame | null;
  navCount: number;
  inPageNavCount: number;
  homeBackUrl: string | null;
  suspended: boolean;
  pinned: boolean;
  groupId: string | null;
}

declare global {
  interface Window {
    __bardoAbLaunched?: boolean;
    __bardoAbBlocked?: boolean;
    __bardoLaunchAboutBlank?: (src?: string, options?: { title?: string; favicon?: string }) => boolean;
  }
}
