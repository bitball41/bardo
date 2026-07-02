import { CUSTOM_THEMES_KEY, THEMES, type ThemeDef } from "./constants";
import type {
  AnimationLevel,
  CustomTheme,
  CustomThemeColors,
  CustomThemeId,
  Density,
  Settings,
} from "./types";

export const RADIUS_MIN = 0;
export const RADIUS_MAX = 24;
export const BLUR_MIN = 0;
export const BLUR_MAX = 30;
export const OPACITY_MIN = 40;
export const OPACITY_MAX = 100;
export const MAX_CUSTOM_THEMES = 20;
export const THEME_NAME_MAX = 40;

export const DENSITIES: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
  { id: "spacious", label: "Spacious" },
];

export const ANIMATION_LEVELS: { id: AnimationLevel; label: string; hint: string }[] = [
  { id: "full", label: "Full", hint: "All animations and icon motion" },
  { id: "reduced", label: "Reduced", hint: "Keeps quick transitions, stops decorative motion" },
  { id: "none", label: "None", hint: "No transitions or animations" },
];

export const FONT_OPTIONS: { id: string; label: string; stack: string }[] = [
  { id: "system", label: "System", stack: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: "humanist", label: "Humanist", stack: '"Segoe UI", "Trebuchet MS", Verdana, sans-serif' },
  { id: "grotesque", label: "Grotesque", stack: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { id: "serif", label: "Serif", stack: 'Georgia, "Times New Roman", serif' },
  { id: "mono", label: "Monospace", stack: 'ui-monospace, Consolas, "Cascadia Mono", monospace' },
  { id: "display", label: "Display", stack: '"Unbounded", system-ui, sans-serif' },
];

const FONT_BY_ID = new Map(FONT_OPTIONS.map((f) => [f.id, f]));

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const COLOR_KEYS: (keyof CustomThemeColors)[] = [
  "bg",
  "surface",
  "border",
  "text",
  "muted",
  "hover",
  "active",
  "accent",
  "accentContrast",
];

export const COLOR_FIELDS: { key: keyof CustomThemeColors; label: string; hint: string }[] = [
  { key: "bg", label: "Background", hint: "Page and new-tab backdrop" },
  { key: "surface", label: "Surface", hint: "Toolbar, panels and dialogs" },
  { key: "border", label: "Borders", hint: "Dividers and outlines" },
  { key: "text", label: "Primary text", hint: "Main labels and content" },
  { key: "muted", label: "Muted text", hint: "Hints and secondary labels" },
  { key: "hover", label: "Hover surface", hint: "Buttons under the pointer" },
  { key: "active", label: "Active surface", hint: "Pressed and selected controls" },
  { key: "accent", label: "Accent", hint: "Highlights, links and toggles" },
  { key: "accentContrast", label: "Accent contrast", hint: "Text on accent-coloured fills" },
];

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Expands #abc to #aabbcc and lowercases, so native color inputs accept it. */
export function normalizeHex(hex: string): string {
  const h = hex.toLowerCase();
  if (h.length === 4) return "#" + h.slice(1).split("").map((c) => c + c).join("");
  return h;
}

export function sanitizeCustomTheme(raw: unknown): CustomTheme | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id.startsWith("custom:") || t.id.length > 64) return null;

  const colors = t.colors as Record<string, unknown> | undefined;
  if (!colors || typeof colors !== "object") return null;
  const cleanColors = {} as CustomThemeColors;
  for (const key of COLOR_KEYS) {
    if (!isHex(colors[key])) return null;
    cleanColors[key] = normalizeHex(colors[key] as string);
  }

  const glass = (t.glass ?? {}) as Record<string, unknown>;
  const name = typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, THEME_NAME_MAX) : "Custom theme";

  return {
    id: t.id as CustomThemeId,
    name,
    mode: t.mode === "light" ? "light" : "dark",
    base: typeof t.base === "string" && THEMES.some((b) => b.id === t.base) ? t.base : "dark",
    colors: cleanColors,
    radius: clamp(t.radius, RADIUS_MIN, RADIUS_MAX, 8),
    density: t.density === "compact" || t.density === "spacious" ? t.density : "comfortable",
    font: FONT_BY_ID.has(t.font as string) ? (t.font as string) : "system",
    glass: {
      enabled: glass.enabled === true,
      blur: clamp(glass.blur, BLUR_MIN, BLUR_MAX, 12),
      opacity: clamp(glass.opacity, OPACITY_MIN, OPACITY_MAX, 85),
    },
    animation: t.animation === "reduced" || t.animation === "none" ? t.animation : "full",
  };
}

interface StoredThemesV1 {
  version: 1;
  themes: unknown[];
}

export function loadCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Partial<StoredThemesV1> | null;
    if (!data || data.version !== 1 || !Array.isArray(data.themes)) return [];
    const themes: CustomTheme[] = [];
    const seen = new Set<string>();
    for (const entry of data.themes) {
      const theme = sanitizeCustomTheme(entry);
      if (theme && !seen.has(theme.id)) {
        seen.add(theme.id);
        themes.push(theme);
      }
      if (themes.length >= MAX_CUSTOM_THEMES) break;
    }
    return themes;
  } catch {
    return [];
  }
}

export function saveCustomThemes(themes: CustomTheme[]): boolean {
  try {
    const stored: StoredThemesV1 = { version: 1, themes };
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function themeFromBuiltin(def: ThemeDef): CustomTheme {
  const accentContrast = contrastRatio("#ffffff", def.accent) >= contrastRatio("#111111", def.accent) ? "#ffffff" : "#111111";
  return {
    id: `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${def.label} copy`,
    mode: def.mode,
    base: def.id,
    colors: {
      bg: normalizeHex(def.bg),
      surface: normalizeHex(def.surface),
      border: normalizeHex(def.border),
      text: normalizeHex(def.text),
      muted: normalizeHex(def.muted),
      hover: normalizeHex(def.hover),
      active: normalizeHex(def.active),
      accent: normalizeHex(def.accent),
      accentContrast,
    },
    radius: 8,
    density: "comfortable",
    font: "system",
    glass: { enabled: false, blur: 12, opacity: 85 },
    animation: "full",
  };
}

function channel(hex: string, index: number): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255;
}

function luminance(hex: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
}

export function contrastRatio(a: string, b: string): number {
  if (!isHex(a) || !isHex(b)) return 21;
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastWarning {
  message: string;
  ratio: number;
}

export function themeWarnings(colors: CustomThemeColors): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  const check = (a: string, b: string, min: number, message: string) => {
    const ratio = contrastRatio(a, b);
    if (ratio < min) warnings.push({ message, ratio });
  };
  check(colors.text, colors.bg, 4.5, "Primary text is hard to read on the background");
  check(colors.text, colors.surface, 4.5, "Primary text is hard to read on surfaces");
  check(colors.muted, colors.surface, 3, "Muted text is hard to read on surfaces");
  check(colors.accentContrast, colors.accent, 3, "Accent contrast text is hard to read on the accent colour");
  check(colors.accent, colors.surface, 1.6, "The accent colour barely stands out from surfaces");
  return warnings;
}

export function findCustomTheme(themes: CustomTheme[], id: string): CustomTheme | null {
  return themes.find((t) => t.id === id) ?? null;
}

const INLINE_VARS = [
  "--bg",
  "--surface",
  "--border",
  "--text",
  "--muted",
  "--hover",
  "--active",
  "--accent-contrast",
  "--radius",
  "--font-ui",
  "--glass-blur",
  "--glass-opacity",
];

/**
 * Applies theme, accent, density, font, glass and animation level to the
 * document. The single entry point for both built-in and custom themes so
 * Settings, popovers and the theme editor stay in sync.
 */
export function applyThemeToDocument(settings: Settings, customThemes: CustomTheme[]) {
  const root = document.documentElement;
  const custom = settings.theme.startsWith("custom:") ? findCustomTheme(customThemes, settings.theme) : null;

  for (const name of INLINE_VARS) root.style.removeProperty(name);
  if (settings.moreContrast) root.setAttribute("data-contrast", "more");
  else root.removeAttribute("data-contrast");

  if (custom) {
    root.setAttribute("data-theme", custom.mode === "light" ? "light" : "dark");
    const c = custom.colors;
    root.style.setProperty("--bg", c.bg);
    root.style.setProperty("--surface", c.surface);
    root.style.setProperty("--border", c.border);
    root.style.setProperty("--text", c.text);
    root.style.setProperty("--muted", c.muted);
    root.style.setProperty("--hover", c.hover);
    root.style.setProperty("--active", c.active);
    root.style.setProperty("--accent-contrast", c.accentContrast);
    root.style.setProperty("--radius", `${custom.radius}px`);
    const font = FONT_BY_ID.get(custom.font);
    if (font && font.id !== "system") root.style.setProperty("--font-ui", font.stack);
    if (custom.glass.enabled) {
      root.setAttribute("data-glass", "");
      root.style.setProperty("--glass-blur", `${custom.glass.blur}px`);
      root.style.setProperty("--glass-opacity", `${custom.glass.opacity}%`);
    } else {
      root.removeAttribute("data-glass");
    }
    root.setAttribute("data-density", custom.density);
    if (custom.animation === "full") root.removeAttribute("data-anim");
    else root.setAttribute("data-anim", custom.animation);
  } else {
    const builtin = THEMES.some((t) => t.id === settings.theme) ? settings.theme : "dark";
    root.setAttribute("data-theme", builtin);
    root.removeAttribute("data-glass");
    root.removeAttribute("data-density");
    root.removeAttribute("data-anim");
  }

  if (settings.accent) root.style.setProperty("--accent", settings.accent);
  else if (custom) root.style.setProperty("--accent", custom.colors.accent);
  else root.style.removeProperty("--accent");
}

/** True when app-level or OS-level settings ask for less motion. */
export function motionReduced(): boolean {
  if (document.documentElement.getAttribute("data-anim")) return true;
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
